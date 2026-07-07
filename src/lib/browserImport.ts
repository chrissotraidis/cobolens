import type { GraphDocument, GraphEdge, GraphNode, ParseError } from "./graph";

type BrowserScanSettings = {
  extensions: string;
  format: string;
  encoding: string;
};

type SourceKind = "cobol" | "copybook" | "jcl";

type BrowserSourceFile = {
  rel: string;
  kind: SourceKind;
  text: string;
};

export type BrowserProjectImport = {
  graph: GraphDocument;
  rootLabel: string;
  sources: Record<string, string>;
};

export async function analyzeBrowserProject(files: File[], settings: BrowserScanSettings): Promise<BrowserProjectImport> {
  const extensions = normalizedExtensions(settings.extensions);
  const selected = normalizeSelectedFiles(files)
    .filter((file) => extensions.has(extension(file.rel)))
    .sort((left, right) => left.rel.localeCompare(right.rel));

  if (!selected.length) {
    throw new Error(`No COBOL, copybook, or JCL files found. Current extensions: ${[...extensions].join(", ")}`);
  }

  const sources: Record<string, string> = {};
  const sourceFiles: BrowserSourceFile[] = [];
  const parseErrors: ParseError[] = [];

  for (const file of selected) {
    try {
      const text = await file.file.text();
      sources[file.rel] = text;
      sourceFiles.push({ rel: file.rel, kind: sourceKind(file.rel), text });
    } catch (error) {
      parseErrors.push({ file: file.rel, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const builder = new GraphBuilder();
  let parsedFileCount = 0;
  for (const source of sourceFiles) {
    try {
      parseSourceFile(source, builder);
      parsedFileCount += 1;
    } catch (error) {
      parseErrors.push({ file: source.rel, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const graph: GraphDocument = {
    schemaVersion: 1,
    meta: {
      scannedAt: new Date().toISOString(),
      dialectGuess: settings.format === "auto" ? "browser heuristic" : `${settings.format} browser heuristic`,
      fileCount: selected.length,
      parsedFileCount,
      parseErrors,
    },
    nodes: builder.nodes(),
    edges: builder.edges(),
  };

  if (!graph.nodes.length) {
    throw new Error("No COBOL programs, copybooks, or JCL jobs were found in the selected files.");
  }

  return {
    graph,
    rootLabel: `Imported project: ${projectLabel(files)}`,
    sources,
  };
}

function parseSourceFile(source: BrowserSourceFile, builder: GraphBuilder) {
  const lines = source.text.split(/\r?\n/);
  if (source.kind === "jcl") {
    parseJcl(source, lines, builder);
    return;
  }
  parseCobol(source, lines, builder);
}

function parseCobol(source: BrowserSourceFile, lines: string[], builder: GraphBuilder) {
  const ownerName = source.kind === "copybook" ? fileStem(source.rel) : findProgramName(lines, fileStem(source.rel));
  const ownerId = `${source.kind === "copybook" ? "copy" : "prog"}:${normalize(ownerName)}`;
  const ownerType = source.kind === "copybook" ? "copybook" : "program";
  builder.node({
    id: ownerId,
    type: ownerType,
    name: ownerName,
    file: source.rel,
    lines: [1, Math.max(1, lines.length)],
  });

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const tokens = tokenize(lines[index]);
    if (!tokens.length) continue;

    const dataItem = dataItemDefinition(tokens);
    if (dataItem) {
      const id = ensureDataItem(builder, dataItem, source, lineNumber);
      builder.edge({ from: ownerId, to: id, type: "DEFINES", site: site(source, lineNumber) });
    }

    if (equals(tokens[0], "COPY") && tokens[1]) {
      const copy = tokens[1];
      const id = `copy:${normalize(copy)}`;
      builder.node({ id, type: "copybook", name: copy, external: true });
      builder.edge({ from: ownerId, to: id, type: "COPIES", site: site(source, lineNumber) });
    }

    const select = selectAssignment(tokens);
    if (select) {
      const logicalFileId = ensureDataset(builder, select.logicalFile, source, lineNumber);
      const ddId = ensureJclDd(builder, select.ddName, source, lineNumber);
      builder.edge({ from: logicalFileId, to: ddId, type: "assigned-to", site: site(source, lineNumber) });
    }

    const performIndex = indexOf(tokens, "PERFORM");
    if (performIndex >= 0 && tokens[performIndex + 1] && !isInlinePerform(tokens[performIndex + 1])) {
      const paragraph = tokens[performIndex + 1];
      const id = `para:${normalize(ownerName)}/${normalize(paragraph)}`;
      builder.node({ id, type: "paragraph", name: paragraph, file: source.rel, lines: [lineNumber, lineNumber] });
      builder.edge({ from: ownerId, to: id, type: "PERFORMS", site: site(source, lineNumber) });
    }

    const callTarget = quotedOrTargetAfter(tokens, "CALL");
    if (callTarget) {
      const id = `prog:${normalize(callTarget)}`;
      builder.node({ id, type: "program", name: callTarget, external: true });
      builder.edge({ from: ownerId, to: id, type: "CALLS", site: site(source, lineNumber) });
    }

    const move = moveTargets(tokens);
    if (move) {
      const from = ensureDataItem(builder, move.from, source, lineNumber);
      const to = ensureDataItem(builder, move.to, source, lineNumber);
      builder.edge({ from, to, type: "moves-to", site: site(source, lineNumber) });
    }

    const readTarget = targetAfter(tokens, "READ");
    if (readTarget) {
      const id = ensureDataset(builder, readTarget, source, lineNumber);
      builder.edge({ from: ownerId, to: id, type: "reads", site: site(source, lineNumber) });
    }

    const writeTarget = targetAfter(tokens, "WRITE");
    if (writeTarget) {
      const id = ensureDataItem(builder, writeTarget, source, lineNumber);
      builder.edge({ from: ownerId, to: id, type: "writes", site: site(source, lineNumber) });
    }

    const table = sqlTable(tokens);
    if (table) {
      const id = `db2:${normalize(table)}`;
      builder.node({ id, type: "db2-table", name: table, external: true });
      builder.edge({ from: ownerId, to: id, type: sqlEdgeType(tokens), site: site(source, lineNumber) });
    }

    const cics = cicsProgram(tokens);
    if (cics) {
      const commandId = `cics:${normalize(ownerName)}/${lineNumber}:${normalize(cics)}`;
      const programId = `prog:${normalize(cics)}`;
      builder.node({ id: commandId, type: "cics-command", name: `LINK ${cics}`, file: source.rel, lines: [lineNumber, lineNumber] });
      builder.node({ id: programId, type: "program", name: cics, external: true });
      builder.edge({ from: ownerId, to: commandId, type: "executes", site: site(source, lineNumber) });
      builder.edge({ from: commandId, to: programId, type: "links", site: site(source, lineNumber) });
    }
  }
}

function parseJcl(source: BrowserSourceFile, lines: string[], builder: GraphBuilder) {
  let jobName = fileStem(source.rel);
  let jobId = `job:${normalize(jobName)}`;
  let currentStepId = "";
  let previousStepId = "";
  const stepIds: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index].trim();
    if (!line.startsWith("//")) continue;

    const tokens = tokenize(line.slice(2));
    if (tokens.length >= 2 && equals(tokens[1], "JOB")) {
      jobName = tokens[0];
      jobId = `job:${normalize(jobName)}`;
      builder.node({ id: jobId, type: "jcl-job", name: jobName, file: source.rel, lines: [lineNumber, lineNumber], steps: [] });
      continue;
    }

    const execIndex = indexOf(tokens, "EXEC");
    if (execIndex > 0) {
      const stepName = tokens[0];
      currentStepId = `step:${normalize(jobName)}/${normalize(stepName)}`;
      stepIds.push(currentStepId);
      builder.node({ id: currentStepId, type: "jcl-step", name: stepName, file: source.rel, lines: [lineNumber, lineNumber] });
      builder.edge({ from: jobId, to: currentStepId, type: "CONTAINS", site: site(source, lineNumber) });
      if (previousStepId) {
        builder.edge({ from: previousStepId, to: currentStepId, type: "RUNS-AFTER", site: site(source, lineNumber) });
      }
      previousStepId = currentStepId;

      const program = execProgram(tokens.slice(execIndex + 1));
      if (program) {
        const id = `prog:${normalize(program)}`;
        builder.node({ id, type: "program", name: program, external: true });
        builder.edge({ from: currentStepId, to: id, type: "RUNS", site: site(source, lineNumber) });
      }
      continue;
    }

    if (currentStepId && tokens.length >= 2 && equals(tokens[1], "DD")) {
      const dataset = dsn(line);
      if (!dataset) continue;
      const ddId = ensureJclDd(builder, tokens[0], source, lineNumber);
      const datasetId = ensureDataset(builder, dataset, source, lineNumber);
      builder.edge({ from: currentStepId, to: ddId, type: "DECLARES-DD", site: site(source, lineNumber) });
      builder.edge({ from: ddId, to: datasetId, type: "uses-dd", site: site(source, lineNumber) });
    }
  }

  builder.node({ id: jobId, type: "jcl-job", name: jobName, file: source.rel, lines: [1, Math.max(1, lines.length)], steps: stepIds });
}

function dataItemDefinition(tokens: string[]) {
  if (tokens.length < 2 || !/^\d+$/.test(tokens[0]) || equals(tokens[1], "FILLER")) return "";
  return tokens[1];
}

function moveTargets(tokens: string[]) {
  if (!equals(tokens[0], "MOVE")) return null;
  const toIndex = indexOf(tokens, "TO");
  if (toIndex < 2 || !tokens[toIndex + 1]) return null;
  return { from: tokens[1], to: tokens[toIndex + 1] };
}

function selectAssignment(tokens: string[]) {
  if (!equals(tokens[0], "SELECT") || !tokens[1]) return null;
  const assignIndex = indexOf(tokens, "ASSIGN");
  const toIndex = indexOf(tokens, "TO");
  const ddName = tokens[toIndex > assignIndex ? toIndex + 1 : assignIndex + 1];
  return assignIndex >= 0 && ddName ? { logicalFile: tokens[1], ddName } : null;
}

function sqlTable(tokens: string[]) {
  return targetAfter(tokens, "FROM");
}

function sqlEdgeType(tokens: string[]) {
  return tokens.some((token) => equals(token, "UPDATE") || equals(token, "INSERT")) ? "updates" : "queries";
}

function cicsProgram(tokens: string[]) {
  if (indexOf(tokens, "CICS") < 0 || (indexOf(tokens, "LINK") < 0 && indexOf(tokens, "XCTL") < 0)) return "";
  return targetAfter(tokens, "PROGRAM");
}

function execProgram(tokens: string[]) {
  for (const token of tokens) {
    if (token.toLocaleUpperCase().startsWith("PGM=")) return token.slice(4);
  }
  return targetAfter(tokens, "PGM");
}

function dsn(line: string) {
  const match = line.match(/\bDSN=([^,\s]+)/i);
  return match?.[1]?.replace(/^[.'"]+|[.'"]+$/g, "") ?? "";
}

function targetAfter(tokens: string[], marker: string) {
  const index = indexOf(tokens, marker);
  return index >= 0 ? (tokens[index + 1] ?? "") : "";
}

function quotedOrTargetAfter(tokens: string[], marker: string) {
  return targetAfter(tokens, marker);
}

function ensureDataItem(builder: GraphBuilder, name: string, source: BrowserSourceFile, line: number) {
  const id = `data:${normalize(name)}`;
  builder.node({ id, type: "data-item", name, file: source.rel, lines: [line, line] });
  return id;
}

function ensureDataset(builder: GraphBuilder, name: string, source: BrowserSourceFile, line: number) {
  const id = `dataset:${normalize(name)}`;
  builder.node({ id, type: "dataset", name, file: source.rel, lines: [line, line] });
  return id;
}

function ensureJclDd(builder: GraphBuilder, name: string, source: BrowserSourceFile, line: number) {
  const id = `dd:${normalize(name)}`;
  builder.node({ id, type: "jcl-dd", name, file: source.rel, lines: [line, line] });
  return id;
}

function tokenize(line: string) {
  return [...line.matchAll(/[A-Za-z0-9_$#@-]+(?:=[A-Za-z0-9_$#@.-]+)?/g)]
    .map((match) => clean(match[0]))
    .filter(Boolean);
}

function findProgramName(lines: string[], fallback: string) {
  for (const line of lines) {
    const tokens = tokenize(line);
    for (let index = 0; index < tokens.length; index += 1) {
      if (equals(tokens[index], "PROGRAM-ID") && tokens[index + 1]) return tokens[index + 1];
      if (equals(tokens[index], "PROGRAM") && equals(tokens[index + 1], "ID") && tokens[index + 2]) return tokens[index + 2];
    }
  }
  return fallback;
}

function indexOf(tokens: string[], needle: string) {
  return tokens.findIndex((token) => equals(token, needle));
}

function isInlinePerform(token: string) {
  return ["VARYING", "UNTIL", "TIMES", "WITH", "TEST"].includes(token.toLocaleUpperCase());
}

function site(source: BrowserSourceFile, line: number) {
  return { file: source.rel, line };
}

function sourceKind(path: string): SourceKind {
  const ext = extension(path);
  if (ext === ".jcl") return "jcl";
  if (ext === ".cpy") return "copybook";
  return "cobol";
}

function fileStem(path: string) {
  const parts = path.split("/").filter(Boolean);
  const name = parts.length ? parts[parts.length - 1] : path;
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(0, index) : name;
}

function extension(path: string) {
  const index = path.lastIndexOf(".");
  return index >= 0 ? path.slice(index).toLocaleLowerCase() : "";
}

function clean(value: string) {
  return value.replace(/^[.'"(),;=]+|[.'"(),;=]+$/g, "");
}

function normalize(value: string) {
  return clean(value).toLocaleUpperCase();
}

function equals(left: string | undefined, right: string) {
  return left?.toLocaleUpperCase() === right.toLocaleUpperCase();
}

function normalizedExtensions(value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim().toLocaleLowerCase())
    .filter(Boolean)
    .map((part) => (part.startsWith(".") ? part : `.${part}`));
  return new Set(parts.length ? parts : [".cbl", ".cob", ".cpy", ".jcl"]);
}

function normalizeSelectedFiles(files: File[]) {
  const raw = files.map((file) => ({
    file,
    path: normalizePath(file.webkitRelativePath || file.name),
  }));
  const root = commonSelectedRoot(raw.map((file) => file.path));
  return raw.map(({ file, path }) => ({
    file,
    rel: root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path,
  }));
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).join("/");
}

function commonSelectedRoot(paths: string[]) {
  const roots = new Set(paths.map((path) => path.split("/")[0]).filter(Boolean));
  return roots.size === 1 && paths.some((path) => path.includes("/")) ? [...roots][0] : "";
}

function projectLabel(files: File[]) {
  const roots = new Set(
    files
      .map((file) => normalizePath(file.webkitRelativePath || ""))
      .filter((path) => path.includes("/"))
      .map((path) => path.split("/")[0]),
  );
  return roots.size === 1 ? [...roots][0] : "selected files";
}

class GraphBuilder {
  private nodeMap = new Map<string, GraphNode>();
  private edgeMap = new Map<string, GraphEdge>();

  node(next: GraphNode) {
    const existing = this.nodeMap.get(next.id);
    if (!existing || (!existing.file && next.file) || (existing.external && !next.external)) {
      this.nodeMap.set(next.id, next);
    }
  }

  edge(next: GraphEdge) {
    const siteKey = next.site ? `${next.site.file}:${next.site.line}` : "-";
    this.edgeMap.set(`${next.from}|${next.to}|${next.type}|${siteKey}`, next);
  }

  nodes() {
    return [...this.nodeMap.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  edges() {
    return [...this.edgeMap.values()].sort((left, right) =>
      `${left.from}|${left.to}|${left.type}`.localeCompare(`${right.from}|${right.to}|${right.type}`),
    );
  }
}
