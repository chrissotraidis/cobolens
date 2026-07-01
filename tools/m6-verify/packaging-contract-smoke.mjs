#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8"));
const tauriConfig = await readFile(resolve(repoRoot, "src-tauri", "tauri.conf.json"), "utf8");
const tauriConfigJson = JSON.parse(tauriConfig);
const tauriLib = await readFile(resolve(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
const prepScript = await readFile(resolve(repoRoot, "tools", "packaging", "prepare-sidecar-resource.mjs"), "utf8");
const gitignore = await readFile(resolve(repoRoot, ".gitignore"), "utf8");
const workflow = await optionalText(resolve(repoRoot, ".github", "workflows", "package.yml"));
const packagingReadiness = await readFile(resolve(repoRoot, "tools", "parser-upgrade", "packaging-readiness.mjs"), "utf8");
const packagedGuiSmoke = await readFile(resolve(repoRoot, "tools", "desktop", "packaged-gui-smoke.mjs"), "utf8");

const resources = tauriConfigJson.bundle?.resources ?? {};
const checks = {
  "sidecar build prepares a Tauri resource directory":
    typeof packageJson.scripts?.["build:sidecar"] === "string" &&
    packageJson.scripts["build:sidecar"].includes("cargo build --release") &&
    packageJson.scripts["build:sidecar"].includes("tools/packaging/prepare-sidecar-resource.mjs"),
  "Tauri bundles the generated binaries directory":
    resources["binaries/"] === "binaries/" &&
    !tauriConfig.includes("../sidecar/cobolens-analyze/target/release/cobolens-analyze"),
  "resource prep copies the platform release executable":
    prepScript.includes('process.platform === "win32" ? "cobolens-analyze.exe" : "cobolens-analyze"') &&
    prepScript.includes('"target", "release", exeName') &&
    prepScript.includes('"src-tauri", "binaries"') &&
    prepScript.includes("await rm(resourceDir, { recursive: true, force: true })"),
  "generated resource directory is ignored": gitignore.includes("src-tauri/binaries/"),
  "Tauri runtime resolves packaged binaries by platform":
    tauriLib.includes('Path::new("binaries").join(exe_name)') &&
    tauriLib.includes('"cobolens-analyze.exe"') &&
    tauriLib.includes('"cobolens-analyze"') &&
    tauriLib.includes('env::var("COBOLENS_ANALYZE_BIN")'),
  "Linux packaged smokes inspect the new resource path":
    packagingReadiness.includes('"binaries", "cobolens-analyze"') &&
    packagedGuiSmoke.includes('"binaries", "cobolens-analyze"'),
  "GitHub packaging workflow validates Linux and Windows":
    workflow.includes("ubuntu-22.04") &&
    workflow.includes("windows-latest") &&
    workflow.includes("tauri-apps/tauri-action@v1") &&
    workflow.includes("npm ci") &&
    workflow.includes("tools/m6-verify/packaging-contract-smoke.mjs"),
};

console.log(JSON.stringify({ checks }, null, 2));

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  console.error(`Packaging contract smoke failed: ${failed.join(", ")}`);
  process.exit(1);
}

async function optionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
