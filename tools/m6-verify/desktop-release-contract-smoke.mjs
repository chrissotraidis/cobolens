#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const config = JSON.parse(await readFile(resolve(repoRoot, "src-tauri", "tauri.conf.json"), "utf8"));
const packageWorkflow = await readFile(resolve(repoRoot, ".github", "workflows", "package.yml"), "utf8");
const auditWorkflow = await readFile(resolve(repoRoot, ".github", "workflows", "audit.yml"), "utf8");
const readme = await readFile(resolve(repoRoot, "README.md"), "utf8");
const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8"));

const csp = config.app?.security?.csp;
const connectSrc = csp?.["connect-src"] ?? "";
const checks = {
  "bundle identifier does not conflict with the macOS app suffix": config.identifier === "dev.cobolens.desktop",
  "production CSP is enabled": Boolean(csp && csp["default-src"]?.includes("'self'")),
  "CSP blocks embedded objects and framing": csp?.["object-src"] === "'none'" && csp?.["frame-ancestors"] === "'none'",
  "CSP allows only configured model endpoints":
    connectSrc.includes("http://127.0.0.1:11434") &&
    connectSrc.includes("https://api.anthropic.com") &&
    connectSrc.includes("https://api.openai.com") &&
    connectSrc.includes("https://openrouter.ai") &&
    !connectSrc.includes("https://*"),
  "macOS package build and smoke run in CI":
    packageWorkflow.includes("platform: macos-14") &&
    packageWorkflow.includes('args: "--no-sign"') &&
    packageWorkflow.includes("npm run desktop:macos-packaged-smoke") &&
    packageWorkflow.includes("bundle/dmg/*.dmg"),
  "npm and both Rust lockfiles have advisory gates":
    auditWorkflow.includes("npm audit --audit-level=high") &&
    auditWorkflow.includes("working-directory: src-tauri") &&
    auditWorkflow.includes("working-directory: sidecar/cobolens-analyze"),
  "macOS package smoke is a public command":
    packageJson.scripts?.["desktop:macos-packaged-smoke"] === "node tools/desktop/macos-packaged-smoke.mjs",
  "release stance distinguishes desktop, browser QA, and unsigned artifacts":
    readme.includes("The Tauri desktop app is the v1 product") &&
    readme.includes("browser build is a QA and demo surface") &&
    readme.includes("Unsigned artifacts are not public release installers"),
};

console.log(JSON.stringify({ checks }, null, 2));
const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  console.error(`Desktop release contract smoke failed: ${failed.join(", ")}`);
  process.exit(1);
}
