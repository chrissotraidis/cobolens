use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    env, fs,
    io::{self, Write},
    path::{Path, PathBuf},
    process,
};
use tree_sitter_patched_arborium::Parser;

const MAX_SOURCE_FILE_BYTES: u64 = 16 * 1024 * 1024;
const IGNORED_DIR_NAMES: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".tauri",
    "build",
    "dist",
    "node_modules",
    "target",
];

#[derive(Debug, Clone)]
struct AnalyzeOptions {
    root: PathBuf,
    out: PathBuf,
    format: SourceFormat,
    extensions: Vec<String>,
    encoding: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SourceFormat {
    Fixed,
    Free,
    Auto,
}

impl SourceFormat {
    fn parse(value: &str) -> Result<Self, String> {
        match value.to_ascii_lowercase().as_str() {
            "fixed" => Ok(Self::Fixed),
            "free" => Ok(Self::Free),
            "auto" => Ok(Self::Auto),
            other => Err(format!("unsupported source format: {other}")),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphDocument {
    schema_version: u32,
    meta: GraphMeta,
    nodes: Vec<GraphNode>,
    edges: Vec<GraphEdge>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphMeta {
    scanned_at: String,
    dialect_guess: String,
    file_count: usize,
    parsed_file_count: usize,
    parse_errors: Vec<ParseError>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParseError {
    file: String,
    reason: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphNode {
    id: String,
    #[serde(rename = "type")]
    node_type: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    lines: Option<[usize; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    external: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    steps: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphEdge {
    from: String,
    to: String,
    #[serde(rename = "type")]
    edge_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    site: Option<SourceSite>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SourceSite {
    file: String,
    line: usize,
}

#[derive(Debug, Serialize)]
struct Progress<'a> {
    phase: &'a str,
    done: usize,
    total: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FileKind {
    Cobol,
    Copybook,
    Jcl,
}

#[derive(Debug)]
struct SourceFile {
    path: PathBuf,
    rel: String,
    kind: FileKind,
}

#[derive(Debug)]
struct FileAnalysis {
    warning: Option<String>,
    dialect_signals: BTreeSet<String>,
}

#[derive(Default)]
struct GraphBuilder {
    nodes: BTreeMap<String, GraphNode>,
    edges: BTreeMap<String, GraphEdge>,
}

impl GraphBuilder {
    fn node(&mut self, node: GraphNode) {
        match self.nodes.get_mut(&node.id) {
            Some(existing) => merge_node(existing, node),
            None => {
                self.nodes.insert(node.id.clone(), node);
            }
        }
    }

    fn edge(&mut self, edge: GraphEdge) {
        let site_key = edge
            .site
            .as_ref()
            .map(|site| format!("{}:{}", site.file, site.line))
            .unwrap_or_else(|| "-".to_string());
        let key = format!("{}|{}|{}|{}", edge.from, edge.to, edge.edge_type, site_key);
        self.edges.entry(key).or_insert(edge);
    }

    fn finish(self) -> (Vec<GraphNode>, Vec<GraphEdge>) {
        (
            self.nodes.into_values().collect(),
            self.edges.into_values().collect(),
        )
    }
}

fn merge_node(existing: &mut GraphNode, next: GraphNode) {
    if existing.file.is_none() {
        existing.file = next.file;
    }
    if existing.lines.is_none() {
        existing.lines = next.lines;
    }
    if matches!(existing.external, Some(true)) && next.external != Some(true) {
        existing.external = next.external;
    }
    match (&mut existing.steps, next.steps) {
        (Some(existing_steps), Some(next_steps)) => {
            for step in next_steps {
                if !existing_steps.contains(&step) {
                    existing_steps.push(step);
                }
            }
        }
        (None, Some(next_steps)) => existing.steps = Some(next_steps),
        _ => {}
    }
}

fn main() {
    match parse_args(env::args().skip(1).collect()) {
        Ok(options) => match analyze(&options, io::stdout()) {
            Ok(graph) => {
                if graph.nodes.is_empty() && !graph.meta.parse_errors.is_empty() {
                    eprintln!("no files parsed successfully");
                    process::exit(1);
                }
                if let Err(err) = write_graph(&graph, &options.out) {
                    eprintln!("{err}");
                    process::exit(1);
                }
            }
            Err(err) => {
                eprintln!("{err}");
                process::exit(1);
            }
        },
        Err(err) => {
            eprintln!("{err}");
            print_usage();
            process::exit(2);
        }
    }
}

fn parse_args(args: Vec<String>) -> Result<AnalyzeOptions, String> {
    let mut root: Option<PathBuf> = None;
    let mut out: Option<PathBuf> = None;
    let mut format = SourceFormat::Auto;
    let mut extensions = vec![
        ".cbl".to_string(),
        ".cob".to_string(),
        ".cpy".to_string(),
        ".jcl".to_string(),
    ];
    let mut encoding = "utf8".to_string();

    let mut index = 0;
    while index < args.len() {
        let key = &args[index];
        if matches!(key.as_str(), "--help" | "-h") {
            return Err("help requested".to_string());
        }
        let value = args
            .get(index + 1)
            .ok_or_else(|| format!("missing value for {key}"))?;
        match key.as_str() {
            "--root" => root = Some(PathBuf::from(value)),
            "--out" => out = Some(PathBuf::from(value)),
            "--format" => format = SourceFormat::parse(value)?,
            "--ext" => {
                extensions = value
                    .split(',')
                    .map(str::trim)
                    .filter(|item| !item.is_empty())
                    .map(ToOwned::to_owned)
                    .collect();
            }
            "--encoding" => encoding = value.to_string(),
            other => return Err(format!("unknown argument: {other}")),
        }
        index += 2;
    }

    Ok(AnalyzeOptions {
        root: root.ok_or_else(|| "--root is required".to_string())?,
        out: out.ok_or_else(|| "--out is required".to_string())?,
        format,
        extensions,
        encoding,
    })
}

fn analyze(options: &AnalyzeOptions, mut progress: impl Write) -> Result<GraphDocument, String> {
    if !options.root.is_dir() {
        return Err(format!(
            "root is not a directory: {}",
            options.root.display()
        ));
    }

    let extensions = normalize_extensions(&options.extensions);
    let files = discover_files(&options.root, &extensions).map_err(|err| err.to_string())?;
    let total = files.len();
    let mut builder = GraphBuilder::default();
    let mut parse_errors = Vec::new();
    let mut parsed_file_count = 0;
    let mut dialect_signals = BTreeSet::new();

    for (index, source_file) in files.iter().enumerate() {
        emit_progress(&mut progress, "parse", index, total)?;
        match parse_file(
            source_file,
            options.format,
            options.encoding.as_str(),
            &mut builder,
        ) {
            Ok(analysis) => {
                parsed_file_count += 1;
                dialect_signals.extend(analysis.dialect_signals);
                if let Some(reason) = analysis.warning {
                    parse_errors.push(ParseError {
                        file: source_file.rel.clone(),
                        reason,
                    });
                }
            }
            Err(reason) => parse_errors.push(ParseError {
                file: source_file.rel.clone(),
                reason,
            }),
        }
    }

    emit_progress(&mut progress, "parse", total, total)?;
    let (nodes, edges) = builder.finish();

    Ok(GraphDocument {
        schema_version: 1,
        meta: GraphMeta {
            scanned_at: current_timestamp(),
            dialect_guess: dialect_guess(&dialect_signals),
            file_count: total,
            parsed_file_count,
            parse_errors,
        },
        nodes,
        edges,
    })
}

fn write_graph(graph: &GraphDocument, out: &Path) -> Result<(), String> {
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let json = serde_json::to_string_pretty(graph).map_err(|err| err.to_string())?;
    fs::write(out, json).map_err(|err| err.to_string())
}

fn parse_file(
    source_file: &SourceFile,
    format: SourceFormat,
    encoding: &str,
    builder: &mut GraphBuilder,
) -> Result<FileAnalysis, String> {
    let content = read_source_text(&source_file.path, encoding)?;
    let logical_lines = match source_file.kind {
        FileKind::Jcl => content.lines().map(ToOwned::to_owned).collect(),
        FileKind::Cobol | FileKind::Copybook => normalize_cobol_lines(&content, format),
    };
    let dialect_signals = scan_dialect_signals(source_file, &content, &logical_lines, format);

    match source_file.kind {
        FileKind::Cobol | FileKind::Copybook => {
            let parse_warning = verify_tree_sitter_parse(&content)
                .err()
                .map(|reason| format!("{reason}; lightweight scan completed"));
            parse_cobol_file(source_file, &logical_lines, builder)?;
            Ok(FileAnalysis {
                warning: parse_warning,
                dialect_signals,
            })
        }
        FileKind::Jcl => {
            parse_jcl_file(source_file, &logical_lines, builder)?;
            Ok(FileAnalysis {
                warning: None,
                dialect_signals,
            })
        }
    }
}

fn scan_dialect_signals(
    source_file: &SourceFile,
    content: &str,
    logical_lines: &[String],
    format: SourceFormat,
) -> BTreeSet<String> {
    let mut signals = BTreeSet::new();
    match source_file.kind {
        FileKind::Jcl => {
            signals.insert("JCL".to_string());
        }
        FileKind::Cobol | FileKind::Copybook => {
            signals.insert("COBOL".to_string());
            if source_file.kind == FileKind::Copybook {
                signals.insert("copybooks".to_string());
            }
            let fixed = match format {
                SourceFormat::Fixed => true,
                SourceFormat::Free => false,
                SourceFormat::Auto => content.lines().any(looks_fixed),
            };
            signals.insert(if fixed { "fixed-format" } else { "free-format" }.to_string());
            if logical_lines.iter().any(|line| has_token_window(line, "EXEC", "SQL")) {
                signals.insert("EXEC SQL".to_string());
            }
            if logical_lines.iter().any(|line| has_token_window(line, "EXEC", "CICS")) {
                signals.insert("EXEC CICS".to_string());
            }
            if logical_lines.iter().any(|line| line.trim_start().starts_with(">>")) {
                signals.insert("compiler directives".to_string());
            }
        }
    }
    signals
}

fn has_token_window(line: &str, first: &str, second: &str) -> bool {
    tokenize(line).windows(2).any(|window| {
        window[0].eq_ignore_ascii_case(first) && window[1].eq_ignore_ascii_case(second)
    })
}

fn dialect_guess(signals: &BTreeSet<String>) -> String {
    if signals.is_empty() {
        return "unknown".to_string();
    }
    let mut labels = Vec::new();
    if signals.contains("EXEC SQL") || signals.contains("EXEC CICS") {
        labels.push("IBM Enterprise COBOL-like".to_string());
    } else if signals.contains("COBOL") {
        labels.push("COBOL".to_string());
    }
    if signals.contains("JCL") {
        labels.push("JCL".to_string());
    }
    let details = signals
        .iter()
        .filter(|signal| signal.as_str() != "COBOL" && signal.as_str() != "JCL")
        .cloned()
        .collect::<Vec<_>>();

    if details.is_empty() {
        labels.join(" + ")
    } else {
        format!("{} ({})", labels.join(" + "), details.join(", "))
    }
}

fn verify_tree_sitter_parse(content: &str) -> Result<(), String> {
    let mut parser = Parser::new();
    parser
        .set_language(&arborium_cobol::language().into())
        .map_err(|err| format!("tree-sitter language setup failed: {err}"))?;
    let tree = parser
        .parse(content, None)
        .ok_or_else(|| "tree-sitter parser returned no tree".to_string())?;
    if tree.root_node().has_error() {
        return Err("tree-sitter parse contained errors".to_string());
    }
    Ok(())
}

fn read_source_text(path: &Path, encoding: &str) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|err| err.to_string())?;
    decode_source_bytes(&bytes, encoding)
}

fn decode_source_bytes(bytes: &[u8], encoding: &str) -> Result<String, String> {
    if encoding.eq_ignore_ascii_case("utf8") || encoding.eq_ignore_ascii_case("utf-8") {
        return String::from_utf8(bytes.to_vec()).map_err(|err| err.to_string());
    }
    if encoding.eq_ignore_ascii_case("cp037")
        || encoding.eq_ignore_ascii_case("ibm037")
        || encoding.eq_ignore_ascii_case("ebcdic-cp-us")
    {
        return Ok(decode_cp037_lossy(bytes));
    }
    Err(format!("unsupported source encoding: {encoding}"))
}

fn decode_cp037_lossy(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| cp037_char(*byte)).collect()
}

fn cp037_char(byte: u8) -> char {
    match byte {
        0x00 => '\0',
        0x05 | 0x15 | 0x25 => '\n',
        0x0d => '\r',
        0x40 => ' ',
        0x4a => '¢',
        0x4b => '.',
        0x4c => '<',
        0x4d => '(',
        0x4e => '+',
        0x4f => '|',
        0x50 => '&',
        0x5a => '!',
        0x5b => '$',
        0x5c => '*',
        0x5d => ')',
        0x5e => ';',
        0x5f => '¬',
        0x60 => '-',
        0x61 => '/',
        0x6a => '¦',
        0x6b => ',',
        0x6c => '%',
        0x6d => '_',
        0x6e => '>',
        0x6f => '?',
        0x7a => ':',
        0x7b => '#',
        0x7c => '@',
        0x7d => '\'',
        0x7e => '=',
        0x7f => '"',
        0x81..=0x89 => (b'a' + (byte - 0x81)) as char,
        0x91..=0x99 => (b'j' + (byte - 0x91)) as char,
        0xa2..=0xa9 => (b's' + (byte - 0xa2)) as char,
        0xc1..=0xc9 => (b'A' + (byte - 0xc1)) as char,
        0xd1..=0xd9 => (b'J' + (byte - 0xd1)) as char,
        0xe2..=0xe9 => (b'S' + (byte - 0xe2)) as char,
        0xf0..=0xf9 => (b'0' + (byte - 0xf0)) as char,
        _ => char::REPLACEMENT_CHARACTER,
    }
}

fn parse_cobol_file(
    source_file: &SourceFile,
    lines: &[String],
    builder: &mut GraphBuilder,
) -> Result<(), String> {
    let program_name = if source_file.kind == FileKind::Copybook {
        None
    } else {
        find_program_name(lines)
    };

    let file_name = source_file
        .path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("UNKNOWN");
    let owner_name = program_name.as_deref().unwrap_or(file_name);
    let owner_id = match source_file.kind {
        FileKind::Copybook => format!("copy:{}", normalize_symbol(owner_name)),
        FileKind::Cobol => format!("prog:{}", normalize_symbol(owner_name)),
        FileKind::Jcl => unreachable!(),
    };
    let node_type = match source_file.kind {
        FileKind::Copybook => "copybook",
        FileKind::Cobol => "program",
        FileKind::Jcl => unreachable!(),
    };

    builder.node(GraphNode {
        id: owner_id.clone(),
        node_type: node_type.to_string(),
        name: owner_name.to_string(),
        file: Some(source_file.rel.clone()),
        lines: Some([1, lines.len().max(1)]),
        external: None,
        steps: None,
    });

    for (idx, line) in lines.iter().enumerate() {
        let line_number = idx + 1;
        let tokens = tokenize(line);
        if tokens.is_empty() {
            continue;
        }

        if let Some(data_item) = data_item_definition(&tokens) {
            let data_id = format!("data:{}", normalize_symbol(data_item));
            builder.node(GraphNode {
                id: data_id.clone(),
                node_type: "data-item".to_string(),
                name: data_item.to_string(),
                file: Some(source_file.rel.clone()),
                lines: Some([line_number, line_number]),
                external: None,
                steps: None,
            });
            builder.edge(GraphEdge {
                from: owner_id.clone(),
                to: data_id,
                edge_type: "DEFINES".to_string(),
                site: Some(site(source_file, line_number)),
            });
        }

        if let Some((logical_file, dd_name)) = select_assign_target(&tokens) {
            let logical_file_id =
                ensure_dataset(builder, logical_file, Some(source_file), Some(line_number));
            let dd_id = ensure_jcl_dd(builder, dd_name, Some(source_file), Some(line_number));
            builder.edge(GraphEdge {
                from: logical_file_id,
                to: dd_id,
                edge_type: "assigned-to".to_string(),
                site: Some(site(source_file, line_number)),
            });
        }

        if let Some(copybook) = copy_target(&tokens) {
            let copy_id = format!("copy:{}", normalize_symbol(copybook));
            builder.node(GraphNode {
                id: copy_id.clone(),
                node_type: "copybook".to_string(),
                name: copybook.to_string(),
                file: None,
                lines: None,
                external: Some(true),
                steps: None,
            });
            builder.edge(GraphEdge {
                from: owner_id.clone(),
                to: copy_id,
                edge_type: "COPIES".to_string(),
                site: Some(site(source_file, line_number)),
            });
        }

        if let Some(program) = call_target(&tokens) {
            let program_name = clean_symbol(program);
            let program_id = format!("prog:{}", normalize_symbol(&program_name));
            builder.node(GraphNode {
                id: program_id.clone(),
                node_type: "program".to_string(),
                name: program_name,
                file: None,
                lines: None,
                external: Some(true),
                steps: None,
            });
            builder.edge(GraphEdge {
                from: owner_id.clone(),
                to: program_id,
                edge_type: "CALLS".to_string(),
                site: Some(site(source_file, line_number)),
            });
        }

        if let Some((source, target)) = move_targets(&tokens) {
            let source_id = ensure_data_item(builder, source, source_file, line_number);
            let target_id = ensure_data_item(builder, target, source_file, line_number);
            builder.edge(GraphEdge {
                from: source_id,
                to: target_id,
                edge_type: "moves-to".to_string(),
                site: Some(site(source_file, line_number)),
            });
        }

        if let Some(read_target) = read_target(&tokens) {
            let target_id =
                ensure_dataset(builder, read_target, Some(source_file), Some(line_number));
            builder.edge(GraphEdge {
                from: owner_id.clone(),
                to: target_id,
                edge_type: "reads".to_string(),
                site: Some(site(source_file, line_number)),
            });
        }

        if let Some(write_target) = write_target(&tokens) {
            let target_id = ensure_data_item(builder, write_target, source_file, line_number);
            builder.edge(GraphEdge {
                from: owner_id.clone(),
                to: target_id,
                edge_type: "writes".to_string(),
                site: Some(site(source_file, line_number)),
            });
        }

        if let Some(table) = sql_table_target(&tokens) {
            let table_id = format!("db2:{}", normalize_symbol(table));
            builder.node(GraphNode {
                id: table_id.clone(),
                node_type: "db2-table".to_string(),
                name: table.to_string(),
                file: None,
                lines: None,
                external: Some(true),
                steps: None,
            });
            builder.edge(GraphEdge {
                from: owner_id.clone(),
                to: table_id,
                edge_type: sql_table_edge_type(&tokens).to_string(),
                site: Some(site(source_file, line_number)),
            });
        }

        if let Some(program) = cics_link_target(&tokens) {
            let command_id = format!(
                "cics:{}/{}:{}",
                normalize_symbol(owner_name),
                line_number,
                normalize_symbol(program)
            );
            let program_id = format!("prog:{}", normalize_symbol(program));
            builder.node(GraphNode {
                id: command_id.clone(),
                node_type: "cics-command".to_string(),
                name: format!("LINK {program}"),
                file: Some(source_file.rel.clone()),
                lines: Some([line_number, line_number]),
                external: None,
                steps: None,
            });
            builder.node(GraphNode {
                id: program_id.clone(),
                node_type: "program".to_string(),
                name: program.to_string(),
                file: None,
                lines: None,
                external: Some(true),
                steps: None,
            });
            builder.edge(GraphEdge {
                from: owner_id.clone(),
                to: command_id.clone(),
                edge_type: "executes".to_string(),
                site: Some(site(source_file, line_number)),
            });
            builder.edge(GraphEdge {
                from: command_id,
                to: program_id,
                edge_type: "links".to_string(),
                site: Some(site(source_file, line_number)),
            });
        }

        if let Some(paragraph) = perform_target(&tokens) {
            let paragraph_id = format!(
                "para:{}/{}",
                normalize_symbol(owner_name),
                normalize_symbol(paragraph)
            );
            builder.node(GraphNode {
                id: paragraph_id.clone(),
                node_type: "paragraph".to_string(),
                name: paragraph.to_string(),
                file: Some(source_file.rel.clone()),
                lines: Some([line_number, line_number]),
                external: None,
                steps: None,
            });
            builder.edge(GraphEdge {
                from: owner_id.clone(),
                to: paragraph_id,
                edge_type: "PERFORMS".to_string(),
                site: Some(site(source_file, line_number)),
            });
        }
    }

    Ok(())
}

fn parse_jcl_file(
    source_file: &SourceFile,
    lines: &[String],
    builder: &mut GraphBuilder,
) -> Result<(), String> {
    let mut job_name = source_file
        .path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("JOB")
        .to_string();
    let mut job_id = format!("job:{}", normalize_symbol(&job_name));
    let mut previous_step_id: Option<String> = None;
    let mut current_step_id: Option<String> = None;
    let mut steps = Vec::new();

    for (idx, line) in lines.iter().enumerate() {
        let line_number = idx + 1;
        let trimmed = line.trim_start();
        if !trimmed.starts_with("//") {
            continue;
        }
        let body = trimmed.trim_start_matches('/').trim_start();
        let tokens = tokenize(body);
        if tokens.len() >= 2 && tokens[1].eq_ignore_ascii_case("JOB") {
            job_name = tokens[0].to_string();
            job_id = format!("job:{}", normalize_symbol(&job_name));
            builder.node(GraphNode {
                id: job_id.clone(),
                node_type: "jcl-job".to_string(),
                name: job_name.clone(),
                file: Some(source_file.rel.clone()),
                lines: Some([line_number, line_number]),
                external: None,
                steps: Some(Vec::new()),
            });
            continue;
        }

        if let Some(exec_index) = tokens
            .iter()
            .position(|token| token.eq_ignore_ascii_case("EXEC"))
        {
            if exec_index == 0 {
                continue;
            }
            let step_name = tokens[0].to_string();
            let step_id = format!(
                "step:{}/{}",
                normalize_symbol(&job_name),
                normalize_symbol(&step_name)
            );
            steps.push(step_id.clone());
            builder.node(GraphNode {
                id: step_id.clone(),
                node_type: "jcl-step".to_string(),
                name: step_name,
                file: Some(source_file.rel.clone()),
                lines: Some([line_number, line_number]),
                external: None,
                steps: None,
            });
            builder.edge(GraphEdge {
                from: job_id.clone(),
                to: step_id.clone(),
                edge_type: "CONTAINS".to_string(),
                site: Some(site(source_file, line_number)),
            });
            if let Some(prev) = previous_step_id {
                builder.edge(GraphEdge {
                    from: prev,
                    to: step_id.clone(),
                    edge_type: "RUNS-AFTER".to_string(),
                    site: Some(site(source_file, line_number)),
                });
            }
            previous_step_id = Some(step_id.clone());
            current_step_id = Some(step_id.clone());

            if let Some(program) = exec_program(&tokens[exec_index + 1..]) {
                let program_id = format!("prog:{}", normalize_symbol(program));
                builder.node(GraphNode {
                    id: program_id.clone(),
                    node_type: "program".to_string(),
                    name: program.to_string(),
                    file: None,
                    lines: None,
                    external: Some(true),
                    steps: None,
                });
                builder.edge(GraphEdge {
                    from: step_id,
                    to: program_id,
                    edge_type: "RUNS".to_string(),
                    site: Some(site(source_file, line_number)),
                });
            }
            continue;
        }

        if tokens.len() >= 2 && tokens[1].eq_ignore_ascii_case("DD") {
            let Some(step_id) = current_step_id.as_ref() else {
                continue;
            };
            let Some(dataset) = jcl_dsn(line) else {
                continue;
            };
            let dd_id = ensure_jcl_dd(builder, &tokens[0], Some(source_file), Some(line_number));
            let dataset_id =
                ensure_dataset(builder, &dataset, Some(source_file), Some(line_number));
            builder.edge(GraphEdge {
                from: step_id.clone(),
                to: dd_id.clone(),
                edge_type: "DECLARES-DD".to_string(),
                site: Some(site(source_file, line_number)),
            });
            builder.edge(GraphEdge {
                from: dd_id,
                to: dataset_id,
                edge_type: "uses-dd".to_string(),
                site: Some(site(source_file, line_number)),
            });
        }
    }

    builder.node(GraphNode {
        id: job_id.clone(),
        node_type: "jcl-job".to_string(),
        name: job_name,
        file: Some(source_file.rel.clone()),
        lines: Some([1, lines.len().max(1)]),
        external: None,
        steps: Some(steps),
    });

    Ok(())
}

fn normalize_cobol_lines(content: &str, format: SourceFormat) -> Vec<String> {
    content
        .lines()
        .map(|line| match format {
            SourceFormat::Fixed => fixed_area(line),
            SourceFormat::Free => line.to_string(),
            SourceFormat::Auto => {
                if looks_fixed(line) {
                    fixed_area(line)
                } else {
                    line.to_string()
                }
            }
        })
        .collect()
}

fn fixed_area(line: &str) -> String {
    line.chars().skip(6).take(66).collect()
}

fn looks_fixed(line: &str) -> bool {
    line.len() > 7
        && line
            .chars()
            .take(6)
            .all(|ch| ch.is_ascii_digit() || ch.is_ascii_whitespace())
}

fn find_program_name(lines: &[String]) -> Option<String> {
    for line in lines {
        let tokens = tokenize(line);
        for window in tokens.windows(3) {
            if window[0].eq_ignore_ascii_case("PROGRAM") && window[1].eq_ignore_ascii_case("ID") {
                return Some(clean_symbol(&window[2]));
            }
        }
    }
    None
}

fn copy_target(tokens: &[String]) -> Option<&str> {
    if tokens.first()?.eq_ignore_ascii_case("COPY") {
        return tokens.get(1).map(String::as_str);
    }
    None
}

fn call_target(tokens: &[String]) -> Option<&str> {
    let index = tokens
        .iter()
        .position(|token| token.eq_ignore_ascii_case("CALL"))?;
    tokens.get(index + 1).map(String::as_str)
}

fn perform_target(tokens: &[String]) -> Option<&str> {
    let index = tokens
        .iter()
        .position(|token| token.eq_ignore_ascii_case("PERFORM"))?;
    let target = tokens.get(index + 1)?;
    if is_inline_perform_keyword(target) {
        return None;
    }
    Some(target)
}

fn select_assign_target(tokens: &[String]) -> Option<(&str, &str)> {
    if !tokens.first()?.eq_ignore_ascii_case("SELECT") {
        return None;
    }
    let logical_file = tokens.get(1)?;
    let assign_index = tokens
        .iter()
        .position(|token| token.eq_ignore_ascii_case("ASSIGN"))?;
    let to_index = tokens
        .iter()
        .enumerate()
        .skip(assign_index + 1)
        .find_map(|(index, token)| token.eq_ignore_ascii_case("TO").then_some(index))?;
    let dd_name = tokens.get(to_index + 1)?;
    Some((logical_file, dd_name))
}

fn data_item_definition(tokens: &[String]) -> Option<&str> {
    let level = tokens.first()?;
    if !level.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    if matches!(level.as_str(), "66" | "77" | "88") {
        return None;
    }
    let name = tokens.get(1)?;
    if name.eq_ignore_ascii_case("FILLER") {
        return None;
    }
    Some(name)
}

fn move_targets(tokens: &[String]) -> Option<(&str, &str)> {
    if !tokens.first()?.eq_ignore_ascii_case("MOVE") {
        return None;
    }
    let to_index = tokens
        .iter()
        .position(|token| token.eq_ignore_ascii_case("TO"))?;
    let source = tokens.get(1)?;
    let target = tokens.get(to_index + 1)?;
    Some((source, target))
}

fn read_target(tokens: &[String]) -> Option<&str> {
    let index = tokens
        .iter()
        .position(|token| token.eq_ignore_ascii_case("READ"))?;
    tokens.get(index + 1).map(String::as_str)
}

fn write_target(tokens: &[String]) -> Option<&str> {
    let index = tokens
        .iter()
        .position(|token| token.eq_ignore_ascii_case("WRITE"))?;
    tokens.get(index + 1).map(String::as_str)
}

fn sql_table_target(tokens: &[String]) -> Option<&str> {
    if let Some(index) = tokens
        .iter()
        .position(|token| token.eq_ignore_ascii_case("FROM"))
    {
        return tokens.get(index + 1).map(String::as_str);
    }
    if tokens
        .first()
        .is_some_and(|token| token.eq_ignore_ascii_case("UPDATE"))
    {
        return tokens.get(1).map(String::as_str);
    }
    if tokens.len() >= 3
        && tokens[0].eq_ignore_ascii_case("INSERT")
        && tokens[1].eq_ignore_ascii_case("INTO")
    {
        return tokens.get(2).map(String::as_str);
    }
    None
}

fn sql_table_edge_type(tokens: &[String]) -> &'static str {
    if tokens
        .iter()
        .any(|token| token.eq_ignore_ascii_case("UPDATE") || token.eq_ignore_ascii_case("INSERT"))
    {
        "updates"
    } else {
        "queries"
    }
}

fn cics_link_target(tokens: &[String]) -> Option<&str> {
    let has_exec_cics = tokens.windows(2).any(|window| {
        window[0].eq_ignore_ascii_case("EXEC") && window[1].eq_ignore_ascii_case("CICS")
    });
    if !has_exec_cics
        || !tokens
            .iter()
            .any(|token| token.eq_ignore_ascii_case("LINK") || token.eq_ignore_ascii_case("XCTL"))
    {
        return None;
    }

    let program_index = tokens
        .iter()
        .position(|token| token.eq_ignore_ascii_case("PROGRAM"))?;
    tokens.get(program_index + 1).map(String::as_str)
}

fn exec_program(tokens: &[String]) -> Option<&str> {
    for token in tokens {
        if let Some(program) = token.strip_prefix("PGM=") {
            return Some(program);
        }
    }
    tokens
        .iter()
        .position(|token| token.eq_ignore_ascii_case("PGM"))
        .and_then(|idx| tokens.get(idx + 1))
        .map(String::as_str)
}

fn is_inline_perform_keyword(token: &str) -> bool {
    matches!(
        token.to_ascii_uppercase().as_str(),
        "VARYING" | "UNTIL" | "TIMES" | "WITH" | "TEST"
    )
}

fn jcl_dsn(line: &str) -> Option<String> {
    let upper = line.to_ascii_uppercase();
    let index = upper.find("DSN=")?;
    let raw = &line[index + 4..];
    let dataset = raw
        .split(|ch: char| ch == ',' || ch.is_ascii_whitespace())
        .next()?;
    let dataset = clean_symbol(dataset);
    if dataset.is_empty() {
        None
    } else {
        Some(dataset)
    }
}

fn ensure_data_item(
    builder: &mut GraphBuilder,
    name: &str,
    source_file: &SourceFile,
    line_number: usize,
) -> String {
    let id = format!("data:{}", normalize_symbol(name));
    builder.node(GraphNode {
        id: id.clone(),
        node_type: "data-item".to_string(),
        name: name.to_string(),
        file: Some(source_file.rel.clone()),
        lines: Some([line_number, line_number]),
        external: None,
        steps: None,
    });
    id
}

fn ensure_dataset(
    builder: &mut GraphBuilder,
    name: &str,
    source_file: Option<&SourceFile>,
    line_number: Option<usize>,
) -> String {
    let id = format!("dataset:{}", normalize_symbol(name));
    builder.node(GraphNode {
        id: id.clone(),
        node_type: "dataset".to_string(),
        name: name.to_string(),
        file: source_file.map(|file| file.rel.clone()),
        lines: source_file.and_then(|_| line_number.map(|line| [line, line])),
        external: source_file.is_none().then_some(true),
        steps: None,
    });
    id
}

fn ensure_jcl_dd(
    builder: &mut GraphBuilder,
    name: &str,
    source_file: Option<&SourceFile>,
    line_number: Option<usize>,
) -> String {
    let id = format!("dd:{}", normalize_symbol(name));
    builder.node(GraphNode {
        id: id.clone(),
        node_type: "jcl-dd".to_string(),
        name: name.to_string(),
        file: source_file.map(|file| file.rel.clone()),
        lines: source_file.and_then(|_| line_number.map(|line| [line, line])),
        external: source_file.is_none().then_some(true),
        steps: None,
    });
    id
}

fn tokenize(line: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();

    for ch in line.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '=' | '$' | '#' | '@') {
            current.push(ch);
        } else if !current.is_empty() {
            tokens.push(clean_symbol(&current));
            current.clear();
        }
    }

    if !current.is_empty() {
        tokens.push(clean_symbol(&current));
    }

    tokens
        .into_iter()
        .filter(|token| !token.is_empty())
        .collect()
}

fn clean_symbol(symbol: &str) -> String {
    symbol
        .trim_matches(|ch: char| matches!(ch, '\'' | '"' | '.' | ',' | ';' | '(' | ')' | '='))
        .to_string()
}

fn normalize_symbol(symbol: &str) -> String {
    clean_symbol(symbol).to_ascii_uppercase()
}

fn site(source_file: &SourceFile, line: usize) -> SourceSite {
    SourceSite {
        file: source_file.rel.clone(),
        line,
    }
}

fn discover_files(root: &Path, extensions: &BTreeSet<String>) -> io::Result<Vec<SourceFile>> {
    let mut files = Vec::new();
    discover_files_inner(root, root, extensions, &mut files)?;
    files.sort_by(|left, right| left.rel.cmp(&right.rel));
    Ok(files)
}

fn discover_files_inner(
    root: &Path,
    dir: &Path,
    extensions: &BTreeSet<String>,
    files: &mut Vec<SourceFile>,
) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            if is_ignored_dir(&path) {
                continue;
            }
            discover_files_inner(root, &path, extensions, files)?;
            continue;
        }
        if !metadata.is_file() || metadata.len() > MAX_SOURCE_FILE_BYTES {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| format!(".{}", value.to_ascii_lowercase()));
        let Some(ext) = ext else {
            continue;
        };
        if !extensions.contains(&ext) {
            continue;
        }

        let kind = if ext == ".jcl" {
            FileKind::Jcl
        } else if ext == ".cpy" {
            FileKind::Copybook
        } else {
            FileKind::Cobol
        };
        files.push(SourceFile {
            rel: relative_path(root, &path),
            path,
            kind,
        });
    }
    Ok(())
}

fn is_ignored_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            IGNORED_DIR_NAMES
                .iter()
                .any(|ignored| name.eq_ignore_ascii_case(ignored))
        })
        .unwrap_or(false)
}

fn normalize_extensions(extensions: &[String]) -> BTreeSet<String> {
    extensions
        .iter()
        .map(|ext| {
            let lower = ext.to_ascii_lowercase();
            if lower.starts_with('.') {
                lower
            } else {
                format!(".{lower}")
            }
        })
        .collect()
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn current_timestamp() -> String {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => format!("unix:{}", duration.as_secs()),
        Err(_) => "unix:0".to_string(),
    }
}

fn emit_progress(
    mut writer: impl Write,
    phase: &str,
    done: usize,
    total: usize,
) -> Result<(), String> {
    let progress = Progress { phase, done, total };
    serde_json::to_writer(&mut writer, &progress).map_err(|err| err.to_string())?;
    writeln!(writer).map_err(|err| err.to_string())
}

fn print_usage() {
    eprintln!(
        "usage: cobolens-analyze --root <path> --out <file.json> [--format fixed|free|auto] [--ext .cbl,.cob,.cpy,.jcl] [--encoding utf8|cp037]"
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn decodes_common_cp037_source_text() {
        let bytes = [
            0xc1, 0xc2, 0xc3, 0x40, 0xf1, 0xf2, 0xf3, 0x4b, 0x25, 0xd1, 0xd2, 0xd3,
        ];

        assert_eq!(
            decode_source_bytes(&bytes, "cp037").unwrap(),
            "ABC 123.\nJKL"
        );
    }

    #[test]
    fn rejects_unknown_source_encoding() {
        assert!(decode_source_bytes(b"IDENTIFICATION DIVISION.", "latin1").is_err());
    }

    #[test]
    fn analyzes_cp037_encoded_cobol_file() {
        let root = temp_test_dir("cp037-analyze");
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src").join("EBCDIC.cbl"), cp037_fixture_program()).unwrap();
        let out = root.join("graph.json");
        let options = AnalyzeOptions {
            root: root.clone(),
            out,
            format: SourceFormat::Auto,
            extensions: vec![".cbl".to_string()],
            encoding: "cp037".to_string(),
        };

        let graph = analyze(&options, Vec::new()).unwrap();

        assert_eq!(graph.meta.file_count, 1);
        assert_eq!(graph.meta.parsed_file_count, 1);
        assert!(graph
            .nodes
            .iter()
            .any(|node| { node.node_type == "program" && node.name == "EBCDIC" }));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn analyzes_quoted_cobol_call_with_citation() {
        let root = temp_test_dir("call-analyze");
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(
            root.join("src").join("CALLER.cbl"),
            [
                "       IDENTIFICATION DIVISION.",
                "       PROGRAM-ID. CALLER.",
                "       PROCEDURE DIVISION.",
                "           CALL 'PAYCALC'.",
                "           STOP RUN.",
                "",
            ]
            .join("\n"),
        )
        .unwrap();
        let out = root.join("graph.json");
        let options = AnalyzeOptions {
            root: root.clone(),
            out,
            format: SourceFormat::Auto,
            extensions: vec![".cbl".to_string()],
            encoding: "utf8".to_string(),
        };

        let graph = analyze(&options, Vec::new()).unwrap();

        assert!(graph.nodes.iter().any(|node| node.node_type == "program"
            && node.name == "PAYCALC"
            && node.external == Some(true)));
        assert!(graph.edges.iter().any(|edge| {
            edge.edge_type == "CALLS"
                && edge.from == "prog:CALLER"
                && edge.to == "prog:PAYCALC"
                && edge
                    .site
                    .as_ref()
                    .is_some_and(|site| site.file == "src/CALLER.cbl" && site.line == 4)
        }));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reports_dialect_signals_from_cobol_and_jcl() {
        let root = temp_test_dir("dialect-signals");
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("jcl")).unwrap();
        fs::write(
            root.join("src").join("LINEAGE.cbl"),
            [
                "000100 IDENTIFICATION DIVISION.",
                "000200 PROGRAM-ID. LINEAGE.",
                "000300 PROCEDURE DIVISION.",
                "000400     EXEC SQL",
                "000500       SELECT NAME FROM CUSTOMER_TABLE",
                "000600     END-EXEC.",
                "000700     EXEC CICS LINK PROGRAM('RATEAPI') END-EXEC.",
                "000800     STOP RUN.",
                "",
            ]
            .join("\n"),
        )
        .unwrap();
        fs::write(
            root.join("jcl").join("DAILY.jcl"),
            [
                "//DAILYLN JOB",
                "//STEP010 EXEC PGM=LINEAGE",
                "//CUSTIN DD DSN=BANK.CUSTOMER.MASTER",
                "",
            ]
            .join("\n"),
        )
        .unwrap();
        let out = root.join("graph.json");
        let options = AnalyzeOptions {
            root: root.clone(),
            out,
            format: SourceFormat::Auto,
            extensions: vec![".cbl".to_string(), ".jcl".to_string()],
            encoding: "utf8".to_string(),
        };

        let graph = analyze(&options, Vec::new()).unwrap();

        assert!(graph
            .meta
            .dialect_guess
            .contains("IBM Enterprise COBOL-like"));
        assert!(graph.meta.dialect_guess.contains("JCL"));
        assert!(graph.meta.dialect_guess.contains("EXEC SQL"));
        assert!(graph.meta.dialect_guess.contains("EXEC CICS"));
        assert!(graph.meta.dialect_guess.contains("fixed-format"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn discover_files_skips_artifact_dirs_and_oversized_sources() {
        let root = temp_test_dir("discover-skip-junk");
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::create_dir_all(root.join("target")).unwrap();
        fs::write(
            root.join("src").join("KEEP.cbl"),
            "IDENTIFICATION DIVISION.\n",
        )
        .unwrap();
        fs::write(
            root.join("node_modules").join("IGNORE.cbl"),
            "IDENTIFICATION DIVISION.\n",
        )
        .unwrap();
        fs::write(
            root.join("target").join("IGNORE.cpy"),
            "       01 GENERATED-COPYBOOK.\n",
        )
        .unwrap();
        write_oversized_source(&root.join("src").join("TOO-BIG.cbl"));

        let files = discover_files(
            &root,
            &normalize_extensions(&[".cbl".to_string(), ".cpy".to_string()]),
        )
        .unwrap();

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].rel, "src/KEEP.cbl");
        fs::remove_dir_all(root).unwrap();
    }

    fn temp_test_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        env::temp_dir().join(format!("cobolens-analyze-{name}-{unique}"))
    }

    fn write_oversized_source(path: &Path) {
        fs::write(path, vec![b' '; (MAX_SOURCE_FILE_BYTES + 1) as usize]).unwrap();
    }

    fn cp037_fixture_program() -> Vec<u8> {
        vec![
            0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0xc9, 0xc4, 0xc5, 0xd5, 0xe3, 0xc9, 0xc6,
            0xc9, 0xc3, 0xc1, 0xe3, 0xc9, 0xd6, 0xd5, 0x40, 0xc4, 0xc9, 0xe5, 0xc9, 0xe2, 0xc9,
            0xd6, 0xd5, 0x4b, 0x25, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0xd7, 0xd9, 0xd6,
            0xc7, 0xd9, 0xc1, 0xd4, 0x60, 0xc9, 0xc4, 0x4b, 0x40, 0xc5, 0xc2, 0xc3, 0xc4, 0xc9,
            0xc3, 0x4b, 0x25,
        ]
    }
}
