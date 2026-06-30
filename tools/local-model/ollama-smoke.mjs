#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const model = process.argv[2] ?? "llama3.2";
const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
const report = {
  ready: false,
  baseUrl,
  model,
  checks: {},
  hints: [],
};

const command = spawnSync("ollama", ["--version"], { encoding: "utf8" });
report.checks["ollama command is installed"] = command.status === 0;
if (!report.checks["ollama command is installed"]) {
  report.hints.push("Install Ollama in the same Linux environment that runs Cobolens, then run: ollama pull llama3.2");
  finish(1);
}

report.ollamaVersion = firstLine(command.stdout || command.stderr);

let tags;
try {
  const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
  report.checks["ollama HTTP API is reachable"] = response.ok;
  if (!response.ok) {
    report.hints.push(`Ollama responded with ${response.status}; check OLLAMA_BASE_URL or restart Ollama.`);
    finish(1);
  }
  tags = await response.json();
} catch (error) {
  report.checks["ollama HTTP API is reachable"] = false;
  report.hints.push(`Could not reach Ollama at ${baseUrl}. Start it with: ollama serve`);
  report.error = error instanceof Error ? error.message : String(error);
  finish(1);
}

const models = tags.models?.map((entry) => entry.name).filter(Boolean) ?? [];
report.models = models;
report.checks["at least one local model is installed"] = models.length > 0;
report.checks[`configured model ${model} is installed`] = models.some(
  (name) => name === model || name === `${model}:latest` || name.startsWith(`${model}:`),
);

if (!report.checks["at least one local model is installed"]) {
  report.hints.push(`Install a local model with: ollama pull ${model}`);
}
if (!report.checks[`configured model ${model} is installed`]) {
  report.hints.push(`Cobolens defaults to ${model}; install it with: ollama pull ${model}`);
}

report.ready = Object.values(report.checks).every(Boolean);
finish(report.ready ? 0 : 1);

function finish(code) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(code);
}

function firstLine(value) {
  return value.trim().split(/\r?\n/).filter(Boolean)[0] ?? "";
}
