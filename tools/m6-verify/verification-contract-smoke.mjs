#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8"));
const runner = await readFile(resolve(repoRoot, "tools", "m6-verify", "run.mjs"), "utf8");
const verifyReadme = await readFile(resolve(repoRoot, "tools", "m6-verify", "README.md"), "utf8");
const rootReadme = await readFile(resolve(repoRoot, "README.md"), "utf8");
const healthWorkflow = await readFile(resolve(repoRoot, ".github", "workflows", "health.yml"), "utf8");

const cargoHelpCount = countOccurrences(runner, "Install the Rust toolchain from https://rustup.rs/");
const preRustSmokeIndex = runner.indexOf('name: "verification contract smoke"');
const rustBuildIndex = runner.indexOf('name: "Rust analyzer debug build"');
const frontendBuildIndex = runner.indexOf('name: "frontend build"');
const renderedSmokeIndex = runner.indexOf('name: "rendered UI smoke"');

const checks = {
  "package script runs the M6 verification runner":
    packageJson.scripts?.["m6:verify"] === "node tools/m6-verify/run.mjs",
  "runner gives Cargo a setup-oriented missing-command error":
    cargoHelpCount >= 3 &&
    runner.includes('Missing required command: ${check.command}') &&
    runner.includes('command: "cargo"'),
  "verification contract smoke runs before Rust-only checks":
    preRustSmokeIndex !== -1 &&
    rustBuildIndex !== -1 &&
    preRustSmokeIndex < rustBuildIndex,
  "frontend build runs before rendered browser smoke":
    frontendBuildIndex !== -1 &&
    renderedSmokeIndex !== -1 &&
    frontendBuildIndex < renderedSmokeIndex,
  "root README names the Rust/Cargo prerequisite and rustup source":
    rootReadme.includes("Rust/Cargo from <https://rustup.rs/>") &&
    rootReadme.includes("cargo build --manifest-path sidecar/cobolens-analyze/Cargo.toml"),
  "verification README explains the missing Cargo remedy":
    verifyReadme.includes("Node.js/npm and Rust/Cargo") &&
    verifyReadme.includes("Missing required command: cargo") &&
    verifyReadme.includes("https://rustup.rs/"),
  "health workflow is a clean checkout with Node, Rust, npm ci, and m6 verify":
    healthWorkflow.includes("actions/checkout@v4") &&
    healthWorkflow.includes("actions/setup-node@v4") &&
    healthWorkflow.includes("dtolnay/rust-toolchain@stable") &&
    healthWorkflow.includes("npm ci") &&
    healthWorkflow.includes("npm run m6:verify"),
};

console.log(JSON.stringify({ checks }, null, 2));

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  console.error(`Verification contract smoke failed: ${failed.join(", ")}`);
  process.exit(1);
}

function countOccurrences(text, needle) {
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}
