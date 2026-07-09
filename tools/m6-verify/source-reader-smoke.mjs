#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, symlinkSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-source-reader-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  symlinkSync(
    resolve(repoRoot, "node_modules"),
    resolve(tempRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );

  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/lib/sourceReader.ts",
      "src/lib/tauri.ts",
      "src/lib/graph.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
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

  const require = createRequire(resolve(tempRoot, "smoke.cjs"));
  const readerPath = existsSync(resolve(tempRoot, "lib", "sourceReader.js"))
    ? resolve(tempRoot, "lib", "sourceReader.js")
    : resolve(tempRoot, "sourceReader.js");
  const {
    MAX_SOURCE_READER_BYTES,
    padLine,
    readSourceExcerpt,
    readSourceFile,
    sourceBaseForGraphUrl,
  } = require(readerPath);

  global.window = {};
  const longSource = Array.from({ length: 90 }, (_, index) => `line-${index + 1}`).join("\n");
  const directFile = await readSourceFile("", "", { "src/LONG.cbl": longSource }, "src/LONG.cbl", 75, "utf8");
  const earlyFile = await readSourceFile("", "", { "src/LONG.cbl": longSource }, "src/LONG.cbl", -2, "utf8");
  const excerpt = await readSourceExcerpt("", "", { "src/LONG.cbl": longSource }, "src/LONG.cbl", -4, 4, 3, "utf8");
  const missingError = await capturesError(() => readSourceFile("", "", {}, "src/MISSING.cbl", 1, "utf8"));
  const oversizedError = await capturesError(() => readSourceFile(
    "",
    "",
    { "src/HUGE.cbl": "x".repeat(MAX_SOURCE_READER_BYTES + 1) },
    "src/HUGE.cbl",
    1,
    "utf8",
  ));

  const fetchCalls = [];
  global.fetch = async (url) => {
    fetchCalls.push(url);
    if (url === "/bundle.json") {
      return {
        ok: true,
        async json() {
          return { "src/BUNDLE.cbl": "bundle-1\nbundle-2" };
        },
      };
    }
    if (url === "/sources/dir%20with%20space/A%2BB.cbl") {
      return {
        ok: true,
        async text() {
          return "path-1\npath-2";
        },
      };
    }
    return { ok: false };
  };

  const bundleFile = await readSourceFile("", "/bundle.json", {}, "src/BUNDLE.cbl", 1, "utf8");
  await readSourceFile("", "/bundle.json", {}, "src/BUNDLE.cbl", 2, "utf8");
  const pathFile = await readSourceFile("", "/sources/", {}, "dir with space/A+B.cbl", 1, "utf8");
  const bundleMiss = await capturesError(() => readSourceFile("", "/bundle.json", {}, "src/NOPE.cbl", 1, "utf8"));

  const assertions = [
    [
      "graph URL maps to committed source bundle",
      sourceBaseForGraphUrl("/m6-bakeoff-graph.json") === "/m6-bakeoff-source.json" &&
        sourceBaseForGraphUrl("/other-graph.json") === "",
    ],
    ["line numbers are padded for model excerpts", padLine(7) === "    7" && padLine(12345) === "12345"],
    [
      "browser source reader returns the complete file",
      directFile.highlightLine === 75 &&
        directFile.lineCount === 90 &&
        directFile.lines.length === 90 &&
        directFile.lines[0].text === "line-1" &&
        directFile.lines.at(-1).text === "line-90",
    ],
    ["browser source focus clamps to line one", earlyFile.highlightLine === 1 && earlyFile.lines[0].number === 1],
    ["browser source reader rejects files above its safety cap", oversizedError.includes("too large to open safely")],
    [
      "browser excerpts clamp, cap, and mark truncation",
      excerpt.startLine === 1 &&
        excerpt.endLine === 3 &&
        excerpt.truncated === true &&
        excerpt.text === "    1 line-1\n    2 line-2\n    3 line-3",
    ],
    ["missing browser source reports an actionable error", missingError.includes("Use Sample or import the project")],
    [
      "source bundle fetch is cached by bundle URL",
      bundleFile.lines[0].text === "bundle-1" && fetchCalls.filter((url) => url === "/bundle.json").length === 1,
    ],
    [
      "source path fetch encodes each path segment",
      pathFile.lines[0].text === "path-1" && fetchCalls.includes("/sources/dir%20with%20space/A%2BB.cbl"),
    ],
    ["missing bundled source names the unavailable file", bundleMiss.includes("src/NOPE.cbl")],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Source reader smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        checked: assertions.length,
        fullFileLines: directFile.lineCount,
        fetches: fetchCalls.length,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

async function capturesError(fn) {
  try {
    await fn();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
