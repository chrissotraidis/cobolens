#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-embedding-privacy-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "module" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/model/config.ts",
      "src/model/privacy.ts",
      "src/model/embeddings.ts",
      "--target",
      "ES2022",
      "--module",
      "ES2022",
      "--moduleResolution",
      "node",
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

  await patchCompiledImports(compiledModule("embeddings.js"));
  await patchCompiledImports(compiledModule("config.js"));

  const { DEFAULT_MODEL_SETTINGS, settingsForProvider } = await import(compiledModuleUrl("config.js"));
  const { assertEmbeddingPrivacy, embedTexts, ollamaEmbedUrl } = await import(compiledModuleUrl("embeddings.js"));

  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const embedded = await embedTexts({
    settings: { ...DEFAULT_MODEL_SETTINGS, model: "nomic-embed-text" },
    texts: [" program one ", "", "copybook two"],
    fetchImpl,
  });

  const emptyCallsBefore = calls.length;
  const empty = await embedTexts({
    settings: DEFAULT_MODEL_SETTINGS,
    texts: [" ", ""],
    fetchImpl,
  });

  const badCount = await rejects(() =>
    embedTexts({
      settings: DEFAULT_MODEL_SETTINGS,
      texts: ["one", "two"],
      fetchImpl: async () =>
        new Response(JSON.stringify({ embeddings: [[0.1, 0.2]] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    }),
  );

  const assertions = [
    ["local embeddings use Ollama /api/embed", calls[0]?.url === "http://127.0.0.1:11434/api/embed"],
    ["local embeddings use requested model", calls[0]?.body.model === "nomic-embed-text"],
    ["blank inputs are not sent", calls[0]?.body.input.length === 2 && calls[0].body.input[0] === "program one"],
    ["embedding result preserves vectors", embedded.vectors.length === 2 && embedded.vectors[0][1] === 0.2],
    ["empty embedding input does not call fetch", empty.vectors.length === 0 && calls.length === emptyCallsBefore],
    ["localhost embed URL normalizes api suffix", ollamaEmbedUrl("http://localhost:11434") === "http://localhost:11434/api/embed"],
    ["local embedding privacy accepts default Ollama", doesNotThrow(() => assertEmbeddingPrivacy(DEFAULT_MODEL_SETTINGS))],
    ["local embedding privacy rejects remote Ollama", throws(() => assertEmbeddingPrivacy({ ...DEFAULT_MODEL_SETTINGS, baseUrl: "http://192.168.1.10:11434/api" }))],
    ["local embedding privacy rejects https localhost", throws(() => assertEmbeddingPrivacy({ ...DEFAULT_MODEL_SETTINGS, baseUrl: "https://localhost:11434/api" }))],
    ["local embedding privacy rejects cloud provider", throws(() => assertEmbeddingPrivacy({ ...settingsForProvider(DEFAULT_MODEL_SETTINGS, "openai"), privacyMode: "local" }))],
    ["cloud embeddings are not silently sent", throws(() => assertEmbeddingPrivacy(settingsForProvider(DEFAULT_MODEL_SETTINGS, "openai")))],
    ["embedding vector count mismatch rejects", badCount],
  ];

  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Embedding privacy smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(JSON.stringify({ checks: Object.fromEntries(assertions) }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

async function patchCompiledImports(file) {
  if (!existsSync(file)) return;
  const { readFile, writeFile } = await import("node:fs/promises");
  const source = await readFile(file, "utf8");
  await writeFile(
    file,
    source
      .replaceAll('from "./config"', 'from "./config.js"')
      .replaceAll('from "./privacy"', 'from "./privacy.js"'),
  );
}

function compiledModule(filename) {
  const nested = resolve(tempRoot, "model", filename);
  return existsSync(nested) ? nested : resolve(tempRoot, filename);
}

function compiledModuleUrl(filename) {
  return pathToFileURL(compiledModule(filename)).href;
}

function doesNotThrow(fn) {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

function throws(fn) {
  return !doesNotThrow(fn);
}

async function rejects(fn) {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}
