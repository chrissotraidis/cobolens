#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-source-line-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/source/sourceLineLabels.ts",
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
  const labelsPath = existsSync(resolve(tempRoot, "source", "sourceLineLabels.js"))
    ? resolve(tempRoot, "source", "sourceLineLabels.js")
    : resolve(tempRoot, "sourceLineLabels.js");
  const {
    sourceLineClassName,
    sourceLineLabel,
    sourceLineMarker,
    sourceLineStateLabel,
  } = require(labelsPath);

  const assertions = [
    ["single line label uses fallback", sourceLineLabel(undefined, 12) === "line 12"],
    ["range line label names start and end", sourceLineLabel([1, 6], 12) === "lines 1-6"],
    ["degenerate range reads as a single line", sourceLineLabel([7, 7], 1) === "line 7"],
    ["plain source line class stays minimal", sourceLineClassName(false, false, false) === "source-line"],
    [
      "selected focused citation class includes all states",
      sourceLineClassName(true, true, true) === "source-line is-selected-range is-highlighted is-citation-line",
    ],
    [
      "source line marker precedence favors citations",
      sourceLineMarker(true, true, true) === "C" &&
        sourceLineMarker(true, true, false) === ">" &&
        sourceLineMarker(true, false, false) === "|" &&
        sourceLineMarker(false, false, false) === " ",
    ],
    [
      "source line state label is ordered for assistive tech",
      sourceLineStateLabel(true, true, true) === ", focused citation, selected symbol range" &&
        sourceLineStateLabel(true, true, false) === ", focused line, selected symbol range" &&
        sourceLineStateLabel(false, false, false) === "",
    ],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Source line smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        checked: assertions.length,
        citationMarker: sourceLineMarker(true, true, true),
        rangeLabel: sourceLineLabel([1, 6]),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
