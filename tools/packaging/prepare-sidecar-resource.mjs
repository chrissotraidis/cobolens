#!/usr/bin/env node
import { chmod, copyFile, mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const exeName = process.platform === "win32" ? "cobolens-analyze.exe" : "cobolens-analyze";
const source = resolve(repoRoot, "sidecar", "cobolens-analyze", "target", "release", exeName);
const resourceDir = resolve(repoRoot, "src-tauri", "binaries");
const target = resolve(resourceDir, exeName);

try {
  const info = await stat(source);
  if (!info.isFile()) {
    throw new Error(`${source} is not a file`);
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`Sidecar release binary is missing: ${reason}`);
  console.error("Run the sidecar release build before preparing Tauri resources.");
  process.exit(1);
}

await rm(resourceDir, { recursive: true, force: true });
await mkdir(resourceDir, { recursive: true });
await copyFile(source, target);
if (process.platform !== "win32") {
  await chmod(target, 0o755);
}

console.log(`Prepared Tauri sidecar resource: ${target}`);
