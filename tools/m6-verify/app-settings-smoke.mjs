#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, symlinkSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-app-settings-"));
const storageKey = "cobolens.settings.v1";

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
      "src/lib/appSettings.ts",
      "src/lib/tauri.ts",
      "src/model/config.ts",
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
  const settingsPath = existsSync(resolve(tempRoot, "lib", "appSettings.js"))
    ? resolve(tempRoot, "lib", "appSettings.js")
    : resolve(tempRoot, "appSettings.js");
  const {
    DEFAULT_SCAN_SETTINGS,
    loadAppSettings,
    normalizedScanSettings,
    saveAppSettings,
  } = require(settingsPath);

  const storage = new Map();
  global.window = {
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
  };

  const noStoredSettings = await loadAppSettings();

  storage.set(
    storageKey,
    JSON.stringify({
      schemaVersion: 99,
      model: {
        provider: "openai",
        model: "",
        embeddingModel: "nomic-embed-text",
        baseUrl: "http://should-clear.example",
        privacyMode: "local",
        rosettaLanguage: "",
      },
      scan: {
        format: "free",
        extensions: "CBL, .COB, , copy",
        encoding: "latin1",
      },
    }),
  );
  const cloudSettings = await loadAppSettings();

  storage.set(
    storageKey,
    JSON.stringify({
      model: {
        provider: "ollama",
        model: "llama3.2:1b",
        embeddingModel: "",
        baseUrl: "http://127.0.0.1:11434/api/",
        rosettaLanguage: "java",
      },
      scan: {
        format: "fixed",
        extensions: "JCL,cbl",
        encoding: "utf8",
      },
    }),
  );
  const localSettings = await loadAppSettings();

  storage.set(storageKey, JSON.stringify({ model: { provider: "wat" }, scan: { format: "record" } }));
  const fallbackSettings = await loadAppSettings();

  storage.set(storageKey, "{not json");
  const malformedSettings = await loadAppSettings();

  await saveAppSettings({
    schemaVersion: 1,
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      embeddingModel: "",
      baseUrl: "",
      privacyMode: "cloud",
      rosettaLanguage: "python",
    },
    scan: DEFAULT_SCAN_SETTINGS,
  });
  const savedSettings = JSON.parse(storage.get(storageKey));

  const normalizedScan = normalizedScanSettings({
    format: "auto",
    extensions: "CBL, .COB, , cpy",
    encoding: "utf8",
  });

  const assertions = [
    ["missing browser settings return null", noStoredSettings === null],
    ["scan extensions normalize case, dots, whitespace, and blanks", normalizedScan.extensions === ".cbl,.cob,.cpy"],
    [
      "cloud provider settings clear local-only fields and force cloud privacy",
      cloudSettings.schemaVersion === 1 &&
        cloudSettings.model.provider === "openai" &&
        cloudSettings.model.model === "gpt-5-mini" &&
        cloudSettings.model.embeddingModel === "" &&
        cloudSettings.model.baseUrl === "" &&
        cloudSettings.model.privacyMode === "cloud" &&
        cloudSettings.model.rosettaLanguage === "python" &&
        cloudSettings.scan.format === "free" &&
        cloudSettings.scan.extensions === ".cbl,.cob,.copy" &&
        cloudSettings.scan.encoding === "latin1",
    ],
    [
      "ollama settings keep local fields and strip the display-only /api suffix",
      localSettings.model.provider === "ollama" &&
        localSettings.model.model === "llama3.2:1b" &&
        localSettings.model.embeddingModel === "nomic-embed-text" &&
        localSettings.model.baseUrl === "http://127.0.0.1:11434" &&
        localSettings.model.privacyMode === "local" &&
        localSettings.model.rosettaLanguage === "java" &&
        localSettings.scan.format === "fixed" &&
        localSettings.scan.extensions === ".jcl,.cbl",
    ],
    [
      "unknown saved values fall back to defaults",
      fallbackSettings.model.provider === "ollama" &&
        fallbackSettings.model.model === "llama3.2" &&
        fallbackSettings.model.embeddingModel === "nomic-embed-text" &&
        fallbackSettings.scan.format === "auto" &&
        fallbackSettings.scan.extensions === ".cbl,.cob,.cpy,.jcl",
    ],
    ["malformed browser settings fall back without throwing", malformedSettings === null],
    [
      "browser settings save to the versioned localStorage key",
      savedSettings.schemaVersion === 1 &&
        savedSettings.model.provider === "anthropic" &&
        savedSettings.scan.extensions === ".cbl,.cob,.cpy,.jcl",
    ],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`App settings smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        checked: assertions.length,
        providerFallback: fallbackSettings.model.provider,
        savedKey: storageKey,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
