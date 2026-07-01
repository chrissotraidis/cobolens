#!/usr/bin/env node
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-summary-guard-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "module" }));
  await symlink(resolve(repoRoot, "node_modules"), resolve(tempRoot, "node_modules"), "dir");

  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/model/summaries.ts",
      "src/model/answerGuard.ts",
      "src/model/config.ts",
      "src/model/privacy.ts",
      "src/model/providers.ts",
      "src/lib/graph.ts",
      "src/retrieval/context.ts",
      "--target",
      "ES2022",
      "--module",
      "ES2022",
      "--moduleResolution",
      "bundler",
      "--outDir",
      tempRoot,
      "--skipLibCheck",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout);
    process.stderr.write(compile.stderr);
    process.exit(compile.status ?? 1);
  }
  await patchCompiledImports("model/summaries.js");
  await patchCompiledImports("model/providers.js");
  await patchCompiledImports("retrieval/context.js");

  const { guardUnitSummaryText } = await import(compiledModuleUrl("model", "summaries.js"));
  const graph = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-graph.json"), "utf8"));
  const sourceBundle = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-source.json"), "utf8"));
  const node = graph.nodes.find((candidate) => candidate.type === "program" && candidate.name === "LINEAGE");
  if (!node) throw new Error("M6 fixture is missing the LINEAGE program node.");
  const excerpt = sourceExcerpt(sourceBundle, node);

  const cited = guardUnitSummaryText({
    graph,
    node,
    excerpt,
    text: "LINEAGE is a program that reads CUSTOMER-FILE (src/LINEAGE.cbl:21).",
  });
  const uncited = guardUnitSummaryText({
    graph,
    node,
    excerpt,
    text: "LINEAGE reads customer records and prepares a report.",
  });
  const footnote = guardUnitSummaryText({
    graph,
    node,
    excerpt,
    text: "LINEAGE reads customer records [1].",
  });

  const checks = {
    "accepts cited summary": cited.guarded === false,
    "guards uncited summary": uncited.guarded === true && uncited.text.includes("model summary"),
    "guards footnote summary": footnote.guarded === true && footnote.text.includes("footnote-style citations"),
    "summary fallback cites source range": /\(src\/LINEAGE\.cbl:1-47\)/.test(uncited.text),
    "summary fallback cites relationship": /\(src\/LINEAGE\.cbl:(11|13|21|26|37|40)\)/.test(uncited.text),
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Summary guard smoke failed: ${failed.join(", ")}`);
    console.error({ cited, uncited, footnote });
    process.exit(1);
  }

  console.log(JSON.stringify({ checks }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function compiledModuleUrl(folder, filename) {
  return pathToFileURL(resolve(tempRoot, folder, filename)).href;
}

function sourceExcerpt(sourceBundle, node) {
  if (!node.file) {
    throw new Error(`Node ${node.id} has no source file.`);
  }
  const text = sourceBundle[node.file];
  if (text == null) {
    throw new Error(`Source ${node.file} is unavailable.`);
  }
  const lines = text.split(/\r?\n/);
  const startLine = node.lines?.[0] ?? 1;
  const endLine = node.lines?.[1] ?? startLine;
  const safeStart = Math.max(1, startLine);
  const safeEnd = Math.min(lines.length, Math.max(safeStart, endLine));
  return {
    file: node.file,
    startLine: safeStart,
    endLine: safeEnd,
    truncated: false,
    text: lines
      .slice(safeStart - 1, safeEnd)
      .map((line, index) => `${String(safeStart + index).padStart(5, " ")} ${line}`)
      .join("\n"),
  };
}

async function patchCompiledImports(path) {
  const target = resolve(tempRoot, path);
  if (!existsSync(target)) return;
  const current = await readFile(target, "utf8");
  const patched = current
    .replaceAll('from "./answerGuard"', 'from "./answerGuard.js"')
    .replaceAll('from "./providers"', 'from "./providers.js"')
    .replaceAll('from "./privacy"', 'from "./privacy.js"')
    .replaceAll('from "./config"', 'from "./config.js"')
    .replaceAll('from "../lib/graph"', 'from "../lib/graph.js"')
    .replaceAll('from "../retrieval/context"', 'from "../retrieval/context.js"');
  if (patched !== current) await writeFile(target, patched);
}
