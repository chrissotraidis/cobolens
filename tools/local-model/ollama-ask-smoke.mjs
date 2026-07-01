#!/usr/bin/env node
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-ollama-ask-"));
const question = "Explain LINEAGE in plain English for a new developer.";

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "module" }));
  await symlink(resolve(repoRoot, "node_modules"), resolve(tempRoot, "node_modules"), "dir");

  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/model/chat.ts",
      "src/model/answerGuard.ts",
      "src/model/config.ts",
      "src/model/privacy.ts",
      "src/model/providers.ts",
      "src/retrieval/context.ts",
      "src/lib/graph.ts",
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
  await patchCompiledImports("model/chat.js");
  await patchCompiledImports("model/providers.js");
  await patchCompiledImports("retrieval/context.js");

  const { DEFAULT_MODEL_SETTINGS } = await import(compiledModuleUrl("model", "config.js"));
  const { generateGroundedAnswer } = await import(compiledModuleUrl("model", "chat.js"));
  const { retrieveQuestionContext } = await import(compiledModuleUrl("retrieval", "context.js"));
  const graph = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-graph.json"), "utf8"));
  const sourceBundle = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-source.json"), "utf8"));
  const context = await retrieveQuestionContext({
    graph,
    question,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const answer = await generateGroundedAnswer({
    question,
    context,
    settings: {
      ...DEFAULT_MODEL_SETTINGS,
      model: process.argv[2] ?? DEFAULT_MODEL_SETTINGS.model,
      baseUrl: process.env.OLLAMA_BASE_URL ? `${process.env.OLLAMA_BASE_URL.replace(/\/+$/, "")}/api` : DEFAULT_MODEL_SETTINGS.baseUrl,
    },
  });

  const checks = {
    "answer returned text": answer.text.length > 0,
    "answer mentions LINEAGE": /LINEAGE/i.test(answer.text),
    "answer treats LINEAGE as a program artifact": /program/i.test(answer.text),
    "answer cites matched source line": /src\/LINEAGE\.cbl:1/i.test(answer.text),
    "answer cites a relationship": /src\/LINEAGE\.cbl:(11|13|21|26|37|40)/i.test(answer.text),
    "answer avoids generic compiler hallucination": !/\b(compiler optimization|recompil\w*)\b/i.test(answer.text),
    "retrieval supplied clickable citation": context.citations.some(
      (citation) => citation.file === "src/LINEAGE.cbl" && [11, 13, 21, 26, 37, 40].includes(citation.line),
    ),
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Ollama Ask smoke failed: ${failed.join(", ")}`);
    console.error(answer.text);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        question,
        answerBytes: Buffer.byteLength(answer.text),
        citationCount: context.citations.length,
        preview: answer.text.slice(0, 320),
        checks,
      },
      null,
      2,
    ),
  );
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
    .replaceAll('from "./providers"', 'from "./providers.js"')
    .replaceAll('from "./answerGuard"', 'from "./answerGuard.js"')
    .replaceAll('from "./prompts"', 'from "./prompts.js"')
    .replaceAll('from "./privacy"', 'from "./privacy.js"')
    .replaceAll('from "./config"', 'from "./config.js"')
    .replaceAll('from "../lib/graph"', 'from "../lib/graph.js"')
    .replaceAll('from "../retrieval/context"', 'from "../retrieval/context.js"');
  if (patched !== current) await writeFile(target, patched);
}
