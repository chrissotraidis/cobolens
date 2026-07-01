#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const model = process.argv[2] ?? "llama3.2";
const defaultModel = "llama3.2";
const recommendedSmallModel = "llama3.2:1b";
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
  if (model !== recommendedSmallModel) report.hints.push(`For a smaller local test model, run: ollama pull ${recommendedSmallModel}`);
}
if (!report.checks[`configured model ${model} is installed`]) {
  const modelLabel = model === defaultModel ? "Cobolens default model" : "Configured model";
  report.hints.push(`${modelLabel} ${model} is not installed; install it with: ollama pull ${model}`);
  if (model !== recommendedSmallModel) report.hints.push(`If this machine is resource constrained, try: ollama pull ${recommendedSmallModel}`);
}

if (report.checks[`configured model ${model} is installed`]) {
  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: "Reply with one short sentence that says local inference is ready.",
        stream: false,
        options: {
          num_predict: 24,
          temperature: 0,
        },
      }),
      signal: AbortSignal.timeout(45000),
    });
    report.checks["local generation completes"] = response.ok;
    if (response.ok) {
      const body = await response.json();
      report.generationBytes = Buffer.byteLength(String(body.response ?? ""));
      report.checks["local generation returned text"] = report.generationBytes > 0;
    } else {
      report.hints.push(`Ollama generation responded with ${response.status}; check the model and server logs.`);
    }
  } catch (error) {
    report.checks["local generation completes"] = false;
    report.checks["local generation returned text"] = false;
    report.hints.push(`Ollama is reachable, but local generation failed. For a smaller local test model, run: ollama pull ${recommendedSmallModel}`);
    report.generationError = error instanceof Error ? error.message : String(error);
  }
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
