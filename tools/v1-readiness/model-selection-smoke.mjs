#!/usr/bin/env node
import { parseInstalledModels, selectReadinessModel } from "../local-model/model-selection.mjs";

const listOutput = [
  "NAME                       ID              SIZE",
  "nomic-embed-text:latest    abc             274 MB",
  "qwen3.5:2b-nvfp4           def             2.5 GB",
].join("\n");

const checks = {
  "Ollama list parser returns installed model names":
    parseInstalledModels(listOutput).join("|") === "nomic-embed-text:latest|qwen3.5:2b-nvfp4",
  "explicit readiness model wins":
    selectReadinessModel({ explicitModel: "custom:latest", listOutput }) === "custom:latest",
  "automatic readiness model skips embedding-only models":
    selectReadinessModel({ listOutput }) === "qwen3.5:2b-nvfp4",
  "readiness model keeps a documented fallback when nothing is installed":
    selectReadinessModel() === "llama3.2:1b",
};

console.log(JSON.stringify({ checks }, null, 2));
const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  console.error(`Readiness model selection smoke failed: ${failed.join(", ")}`);
  process.exit(1);
}
