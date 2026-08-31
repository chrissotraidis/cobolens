#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const analyzer = resolve(
  repoRoot,
  "sidecar",
  "cobolens-analyze",
  "target",
  "debug",
  process.platform === "win32" ? "cobolens-analyze.exe" : "cobolens-analyze",
);
const publicRoot = resolve(repoRoot, "public", "samples");
const sourceExtensions = new Set([".cbl", ".cob", ".cpy", ".jcl"]);

const samples = [
  { id: "m6-lineage", root: resolve(repoRoot, "fixtures", "m6-bakeoff") },
  { id: "ibm-zopen-batch", root: resolve(repoRoot, "samples", "catalog", "ibm-zopen-batch") },
  { id: "zosconnect-api-requester", root: resolve(repoRoot, "samples", "catalog", "zosconnect-api-requester") },
  { id: "aws-carddemo", root: resolve(repoRoot, "samples", "catalog", "aws-carddemo") },
];

await mkdir(publicRoot, { recursive: true });
for (const sample of samples) {
  const graphOut = resolve(publicRoot, `${sample.id}-graph.json`);
  const sourceOut = resolve(publicRoot, `${sample.id}-source.json`);
  const files = await sourceFiles(sample.root);
  const sourceBundle = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [relative(sample.root, file).split("\\").join("/"), await readFile(file, "utf8")]),
    ),
  );

  await writeFile(sourceOut, JSON.stringify(sourceBundle));
  const exitCode = await runAnalyzer(sample.root, graphOut);
  if (exitCode !== 0) process.exit(exitCode);
  console.log(`${sample.id}: ${files.length} source files`);
}

async function sourceFiles(root) {
  const files = [];
  await walk(root, files);
  return files.sort((left, right) => left.localeCompare(right));
}

async function walk(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, files);
    else if (entry.isFile() && sourceExtensions.has(extname(entry.name).toLowerCase())) files.push(path);
  }
}

async function runAnalyzer(root, out) {
  try {
    const info = await stat(analyzer);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    console.error("Sample analyzer is missing. Run: cargo build --manifest-path sidecar/cobolens-analyze/Cargo.toml");
    return 1;
  }

  return new Promise((resolveRun) => {
    const child = spawn(
      analyzer,
      ["--root", root, "--out", out, "--format", "auto", "--ext", ".cbl,.cob,.cpy,.jcl", "--encoding", "utf8"],
      { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] },
    );
    child.on("error", (error) => {
      console.error(error.message);
      resolveRun(1);
    });
    child.on("close", (code) => resolveRun(code ?? 1));
  });
}
