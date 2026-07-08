#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-layout-state-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/lib/layoutState.ts",
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
  const layoutPath = existsSync(resolve(tempRoot, "lib", "layoutState.js"))
    ? resolve(tempRoot, "lib", "layoutState.js")
    : resolve(tempRoot, "layoutState.js");
  const { clampRightWidth, readLayoutFlag, readLayoutNumber } = require(layoutPath);

  delete global.window;
  const serverFallbacks =
    readLayoutFlag("missing", true) === true &&
    readLayoutNumber("missing", 460, 320, 860) === 460 &&
    clampRightWidth(900, false) === 900;

  global.window = mockWindow({
    "rail": "true",
    "inspector": "false",
    "width": "640",
    "too-small": "120",
    "too-large": "1200",
    "not-number": "wide",
  }, 1440);

  const assertions = [
    ["layout helpers fall back without a browser window", serverFallbacks],
    ["layout flags read true and false values", readLayoutFlag("rail", false) === true && readLayoutFlag("inspector", true) === false],
    ["missing layout flags use fallback", readLayoutFlag("missing", true) === true],
    ["layout numbers accept stored values inside range", readLayoutNumber("width", 460, 320, 860) === 640],
    [
      "layout numbers reject invalid stored values",
      readLayoutNumber("too-small", 460, 320, 860) === 460 &&
        readLayoutNumber("too-large", 460, 320, 860) === 460 &&
        readLayoutNumber("not-number", 460, 320, 860) === 460,
    ],
    ["expanded rail clamp leaves center workspace room", clampRightWidth(900, false) === 660 && clampRightWidth(200, false) === 320],
    ["collapsed rail clamp allows wider inspector but keeps bounds", clampRightWidth(920, true) === 912 && clampRightWidth(500, true) === 500],
    [
      "layout helpers tolerate storage errors",
      withBrokenStorage(() => readLayoutFlag("rail", false) === false && readLayoutNumber("width", 460, 320, 860) === 460),
    ],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Layout state smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        checked: assertions.length,
        expandedRailMaxWidth: clampRightWidth(900, false),
        collapsedRailMaxWidth: clampRightWidth(920, true),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function mockWindow(values, innerWidth) {
  return {
    innerWidth,
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
      },
    },
  };
}

function withBrokenStorage(check) {
  const original = global.window;
  global.window = {
    innerWidth: original.innerWidth,
    localStorage: {
      getItem() {
        throw new Error("storage unavailable");
      },
    },
  };
  try {
    return check();
  } finally {
    global.window = original;
  }
}
