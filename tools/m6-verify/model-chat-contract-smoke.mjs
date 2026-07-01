#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const chatSource = await readFile(resolve(repoRoot, "src", "model", "chat.ts"), "utf8");

const checks = {
  "local Ask budget is smaller than cloud budget":
    chatSource.includes("const LOCAL_ASK_MAX_OUTPUT_TOKENS = 260") &&
    chatSource.includes("const CLOUD_ASK_MAX_OUTPUT_TOKENS = 520"),
  "Ask generation uses provider-aware budget": chatSource.includes("maxOutputTokens: askMaxOutputTokens(settings)"),
  "Ollama prompt asks for brief answers": chatSource.includes("keep local Ollama answers brief so they return quickly"),
  "cloud prompt keeps fuller answer allowance": chatSource.includes("Use 2-4 short bullets or sentences unless the question asks for more detail."),
  "budget helper is exported for future behavioral tests": chatSource.includes("export function askMaxOutputTokens"),
};

const failed = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

if (failed.length) {
  console.error(`Model chat contract smoke failed: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(JSON.stringify({ checks }, null, 2));
