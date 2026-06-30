use keyring::Entry;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    env, fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::UNIX_EPOCH,
};
use tauri::{path::BaseDirectory, Emitter, Manager, Runtime};

#[tauri::command]
fn analyze_codebase(
    app: tauri::AppHandle,
    root: String,
    scan: Option<ScanSettings>,
) -> Result<Value, String> {
    analyze_root(&app, root, scan.unwrap_or_default())
}

#[tauri::command]
fn analyze_sample_codebase(
    app: tauri::AppHandle,
    scan: Option<ScanSettings>,
) -> Result<Value, String> {
    let root = sample_root(&app)?.to_string_lossy().to_string();
    analyze_root(&app, root, scan.unwrap_or_default())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanSettings {
    format: String,
    extensions: String,
    encoding: String,
}

impl Default for ScanSettings {
    fn default() -> Self {
        Self {
            format: "auto".to_string(),
            extensions: ".cbl,.cob,.cpy,.jcl".to_string(),
            encoding: "utf8".to_string(),
        }
    }
}

impl ScanSettings {
    fn normalized_extensions(&self) -> Vec<String> {
        self.extensions
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(|item| {
                let lower = item.to_ascii_lowercase();
                if lower.starts_with('.') {
                    lower
                } else {
                    format!(".{lower}")
                }
            })
            .collect()
    }

    fn extension_arg(&self) -> String {
        self.normalized_extensions().join(",")
    }

    fn cache_fingerprint(&self) -> String {
        format!(
            "format={}|ext={}|encoding={}",
            self.format,
            self.extension_arg(),
            self.encoding
        )
    }
}

fn analyze_root<R: Runtime>(
    app: &tauri::AppHandle<R>,
    root: String,
    scan: ScanSettings,
) -> Result<Value, String> {
    let root_path = PathBuf::from(&root)
        .canonicalize()
        .map_err(|err| format!("codebase folder is unavailable: {err}"))?;
    let extensions = scan.normalized_extensions();
    if extensions.is_empty() {
        return Err("scan extensions cannot be empty".to_string());
    }
    let manifest = source_manifest(&root_path, &extensions)?;
    let cache_basis = format!("{}\n{}", scan.cache_fingerprint(), manifest);
    let cache_path = graph_cache_path(&app, &root_path, &cache_basis)?;
    if cache_path.exists() {
        if let Ok(cached) = fs::read_to_string(&cache_path) {
            if let Ok(graph) = serde_json::from_str(&cached) {
                return Ok(graph);
            }
        }
        let _ = fs::remove_file(&cache_path);
    }

    let cache_key = stable_hash(&format!("{}|{}", root_path.display(), cache_basis));
    let out = env::temp_dir().join(format!("cobolens-graph-{cache_key:016x}.json"));
    let analyzer = analyzer_binary_path(&app)?;
    let extension_arg = scan.extension_arg();
    let mut child = Command::new(analyzer)
        .args([
            "--root",
            root_path.to_string_lossy().as_ref(),
            "--out",
            out.to_string_lossy().as_ref(),
            "--format",
            scan.format.as_str(),
            "--ext",
            extension_arg.as_str(),
            "--encoding",
            scan.encoding.as_str(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("failed to spawn analyzer sidecar: {err}"))?;

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = line.map_err(|err| err.to_string())?;
            println!("cobolens-analyze: {line}");
            if let Some(progress) = analyzer_progress_payload(&line, &root_path) {
                let _ = app.emit("analysis-progress", progress);
            }
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|err| format!("failed to wait for analyzer sidecar: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("analyzer sidecar failed: {stderr}"));
    }

    let json = fs::read_to_string(&out).map_err(|err| err.to_string())?;
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    fs::write(&cache_path, &json).map_err(|err| err.to_string())?;
    serde_json::from_str(&json).map_err(|err| err.to_string())
}

fn source_manifest(root: &Path, extensions: &[String]) -> Result<String, String> {
    let mut entries = Vec::new();
    collect_source_manifest(root, root, extensions, &mut entries)?;
    entries.sort();
    Ok(entries.join("\n"))
}

fn analyzer_progress_payload(line: &str, root: &Path) -> Option<Value> {
    let mut payload: Value = serde_json::from_str(line).ok()?;
    let object = payload.as_object_mut()?;
    if !(object.contains_key("phase")
        && object.contains_key("done")
        && object.contains_key("total"))
    {
        return None;
    }
    object.insert(
        "root".to_string(),
        json!(root.to_string_lossy().to_string()),
    );
    Some(payload)
}

fn collect_source_manifest(
    root: &Path,
    current: &Path,
    extensions: &[String],
    entries: &mut Vec<String>,
) -> Result<(), String> {
    for entry in fs::read_dir(current).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        let metadata = entry.metadata().map_err(|err| err.to_string())?;
        if metadata.is_dir() {
            collect_source_manifest(root, &path, extensions, entries)?;
            continue;
        }
        if !metadata.is_file() || !is_source_file(&path, extensions) {
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .map_err(|err| err.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        entries.push(format!("{relative}|{}|{modified}", metadata.len()));
    }
    Ok(())
}

fn is_source_file(path: &Path, extensions: &[String]) -> bool {
    let Some(extension) = path.extension().and_then(|extension| extension.to_str()) else {
        return false;
    };
    let normalized = format!(".{}", extension.to_ascii_lowercase());
    extensions.iter().any(|allowed| allowed == &normalized)
}

fn graph_cache_path<R: Runtime>(
    app: &tauri::AppHandle<R>,
    root: &Path,
    manifest: &str,
) -> Result<PathBuf, String> {
    let key = stable_hash(&format!("{}|{}", root.display(), manifest));
    let filename = format!("{key:016x}.json");
    app.path()
        .resolve(
            Path::new("graph-cache").join(filename),
            BaseDirectory::AppCache,
        )
        .map_err(|err| err.to_string())
}

fn stable_hash(value: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn sample_root<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    if let Ok(path) = app
        .path()
        .resolve("samples/mini-bank", BaseDirectory::Resource)
    {
        if path.exists() {
            return Ok(path);
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_sample = manifest_dir
        .parent()
        .unwrap_or(&manifest_dir)
        .join("samples")
        .join("mini-bank");
    if dev_sample.exists() {
        return Ok(dev_sample);
    }

    Err("bundled sample codebase was not found".to_string())
}

#[tauri::command]
fn read_source_snippet(root: String, file: String, line: usize) -> Result<Value, String> {
    let path = safe_source_path(&root, &file)?;
    let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    let target = line.max(1);
    let start = target.saturating_sub(8).max(1);
    let end = (target + 8).min(lines.len().max(1));
    let snippet_lines: Vec<Value> = (start..=end)
        .map(|number| {
            json!({
                "number": number,
                "text": lines.get(number - 1).copied().unwrap_or_default(),
            })
        })
        .collect();

    Ok(json!({
        "file": file,
        "startLine": start,
        "highlightLine": target,
        "lines": snippet_lines,
    }))
}

#[tauri::command]
fn read_source_excerpt(
    root: String,
    file: String,
    start_line: usize,
    end_line: usize,
    max_lines: usize,
) -> Result<Value, String> {
    let path = safe_source_path(&root, &file)?;
    let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    let start = start_line.max(1);
    let requested_end = end_line.max(start);
    let max_end = lines.len().max(1);
    let end = requested_end.min(max_end);
    let capped_end = (start + max_lines.saturating_sub(1)).min(end);
    let excerpt = (start..=capped_end)
        .map(|number| {
            format!(
                "{}: {}",
                number,
                lines.get(number - 1).copied().unwrap_or_default()
            )
        })
        .collect::<Vec<String>>()
        .join("\n");

    Ok(json!({
        "file": file,
        "startLine": start,
        "endLine": capped_end,
        "truncated": capped_end < end,
        "text": excerpt,
    }))
}

#[tauri::command]
fn write_export_files(
    output_dir: String,
    prefix: String,
    markdown: String,
    mermaid: String,
    png: Vec<u8>,
) -> Result<String, String> {
    let output_dir = PathBuf::from(output_dir)
        .canonicalize()
        .map_err(|err| format!("export folder is unavailable: {err}"))?;
    if !output_dir.is_dir() {
        return Err("export destination must be a folder".to_string());
    }

    if png.len() < 8 || &png[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("export PNG payload was invalid".to_string());
    }

    let prefix = safe_export_prefix(&prefix)?;
    let markdown_path = output_dir.join(format!("{prefix}.md"));
    let mermaid_path = output_dir.join(format!("{prefix}.mmd"));
    let png_path = output_dir.join(format!("{prefix}.png"));

    fs::write(&markdown_path, markdown).map_err(|err| err.to_string())?;
    fs::write(&mermaid_path, mermaid).map_err(|err| err.to_string())?;
    fs::write(&png_path, png).map_err(|err| err.to_string())?;

    Ok(output_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn save_provider_key(provider: String, api_key: String) -> Result<(), String> {
    provider_key_entry(&provider)?
        .set_password(&api_key)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn read_provider_key(provider: String) -> Result<String, String> {
    provider_key_entry(&provider)?
        .get_password()
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn provider_key_state(provider: String) -> Result<bool, String> {
    match provider_key_entry(&provider)?.get_password() {
        Ok(value) => Ok(!value.is_empty()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
fn clear_provider_key(provider: String) -> Result<(), String> {
    match provider_key_entry(&provider)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(_) => Ok(()),
    }
}

fn provider_key_entry(provider: &str) -> Result<Entry, String> {
    let account = match provider {
        "anthropic" => "anthropic-api-key",
        "openai" => "openai-api-key",
        "openrouter" => "openrouter-api-key",
        "ollama" => "ollama-api-key",
        _ => return Err("unknown model provider".to_string()),
    };
    Entry::new("Cobolens", account).map_err(|err| err.to_string())
}

fn safe_source_path(root: &str, file: &str) -> Result<PathBuf, String> {
    let root_path = PathBuf::from(root);
    let file_path = Path::new(file);
    if file_path.is_absolute() {
        return Err("source file path must be relative to the selected root".to_string());
    }

    let root_canonical = root_path.canonicalize().map_err(|err| err.to_string())?;
    let source_path = root_canonical.join(file_path);
    let source_canonical = source_path.canonicalize().map_err(|err| err.to_string())?;
    if !source_canonical.starts_with(&root_canonical) {
        return Err("source file resolved outside the selected root".to_string());
    }
    Ok(source_canonical)
}

fn safe_export_prefix(prefix: &str) -> Result<String, String> {
    let stem = prefix
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(80)
        .collect::<String>();

    if stem.is_empty() {
        return Err("export filename prefix was empty".to_string());
    }

    Ok(stem)
}

fn analyzer_binary_path<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    if let Ok(path) = env::var("COBOLENS_ANALYZE_BIN") {
        return Ok(PathBuf::from(path));
    }

    let current_exe = env::current_exe().map_err(|err| err.to_string())?;
    let exe_name = if cfg!(windows) {
        "cobolens-analyze.exe"
    } else {
        "cobolens-analyze"
    };

    if let Ok(path) = app.path().resolve(exe_name, BaseDirectory::Resource) {
        if path.exists() {
            return Ok(path);
        }
    }

    for ancestor in current_exe.ancestors() {
        let candidate = ancestor.join(exe_name);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_candidate = manifest_dir
        .parent()
        .unwrap_or(&manifest_dir)
        .join("sidecar")
        .join("cobolens-analyze")
        .join("target")
        .join("debug")
        .join(exe_name);
    if dev_candidate.exists() {
        return Ok(dev_candidate);
    }

    Err("could not find cobolens-analyze sidecar; set COBOLENS_ANALYZE_BIN".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            analyze_codebase,
            analyze_sample_codebase,
            read_source_snippet,
            read_source_excerpt,
            write_export_files,
            save_provider_key,
            read_provider_key,
            provider_key_state,
            clear_provider_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn analyze_sample_command_returns_graph() {
        let app = tauri::test::mock_app();
        let root = sample_root(app.handle()).unwrap();
        let graph = analyze_root(
            app.handle(),
            root.to_string_lossy().to_string(),
            ScanSettings::default(),
        )
        .unwrap();

        assert_eq!(graph["schemaVersion"], 1);
        assert_eq!(graph["meta"]["fileCount"], 4);
        assert_eq!(graph["meta"]["parsedFileCount"], 4);
        assert!(graph["nodes"].as_array().unwrap().len() >= 20);
        assert!(graph["edges"].as_array().unwrap().len() >= 20);
        assert!(graph["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|node| { node["type"] == "program" && node["name"] == "ACCTREAD" }));
    }

    #[test]
    fn source_snippet_rejects_paths_outside_root() {
        let root = temp_test_dir("snippet-safe-root");
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("PROGRAM.cbl"),
            "       IDENTIFICATION DIVISION.\n",
        )
        .unwrap();

        let result = read_source_snippet(
            root.to_string_lossy().to_string(),
            "../PROGRAM.cbl".to_string(),
            1,
        );

        assert!(result.is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn source_snippet_reads_selected_file_line() {
        let app = tauri::test::mock_app();
        let root = sample_root(app.handle()).unwrap();
        let snippet = read_source_snippet(
            root.to_string_lossy().to_string(),
            "src/ACCTREAD.cbl".to_string(),
            18,
        )
        .unwrap();

        assert_eq!(snippet["file"], "src/ACCTREAD.cbl");
        assert_eq!(snippet["highlightLine"], 18);
        assert!(snippet["lines"]
            .as_array()
            .unwrap()
            .iter()
            .any(|line| line["text"]
                .as_str()
                .unwrap_or_default()
                .contains("READ CUSTOMER")));
    }

    #[test]
    fn source_manifest_tracks_only_supported_source_files() {
        let root = temp_test_dir("manifest-source-files");
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(
            root.join("src").join("PROG.cbl"),
            "IDENTIFICATION DIVISION.\n",
        )
        .unwrap();
        fs::write(root.join("notes.txt"), "not source\n").unwrap();

        let manifest =
            source_manifest(&root, &ScanSettings::default().normalized_extensions()).unwrap();
        assert!(manifest.contains("src/PROG.cbl|"));
        assert!(!manifest.contains("notes.txt"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn source_manifest_uses_configured_extensions() {
        let root = temp_test_dir("manifest-custom-extensions");
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(
            root.join("src").join("PROG.cbl"),
            "IDENTIFICATION DIVISION.\n",
        )
        .unwrap();
        fs::write(
            root.join("src").join("PROC.pco"),
            "IDENTIFICATION DIVISION.\n",
        )
        .unwrap();

        let default_manifest =
            source_manifest(&root, &ScanSettings::default().normalized_extensions()).unwrap();
        let custom_manifest = source_manifest(&root, &[".pco".to_string()]).unwrap();

        assert!(default_manifest.contains("src/PROG.cbl|"));
        assert!(!default_manifest.contains("src/PROC.pco|"));
        assert!(!custom_manifest.contains("src/PROG.cbl|"));
        assert!(custom_manifest.contains("src/PROC.pco|"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn source_manifest_changes_when_source_changes() {
        let root = temp_test_dir("manifest-invalidates");
        fs::create_dir_all(&root).unwrap();
        let source = root.join("CUSTOMER.cpy");
        fs::write(&source, "       01 CUSTOMER.\n").unwrap();
        let first =
            source_manifest(&root, &ScanSettings::default().normalized_extensions()).unwrap();

        fs::write(
            &source,
            "       01 CUSTOMER.\n          05 CUSTOMER-ID PIC X(10).\n",
        )
        .unwrap();
        let second =
            source_manifest(&root, &ScanSettings::default().normalized_extensions()).unwrap();

        assert_ne!(first, second);
        assert_ne!(stable_hash(&first), stable_hash(&second));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn analyzer_progress_payload_adds_root_to_progress_json() {
        let root = PathBuf::from("/tmp/cobolens-progress-root");
        let payload =
            analyzer_progress_payload(r#"{"phase":"parse","done":2,"total":4}"#, &root).unwrap();

        assert_eq!(payload["phase"], "parse");
        assert_eq!(payload["done"], 2);
        assert_eq!(payload["total"], 4);
        assert_eq!(payload["root"], "/tmp/cobolens-progress-root");
    }

    #[test]
    fn analyzer_progress_payload_ignores_non_progress_lines() {
        let root = PathBuf::from("/tmp/cobolens-progress-root");

        assert!(analyzer_progress_payload("ordinary log line", &root).is_none());
        assert!(analyzer_progress_payload(r#"{"phase":"parse"}"#, &root).is_none());
    }

    fn temp_test_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        env::temp_dir().join(format!("cobolens-{name}-{unique}"))
    }
}
