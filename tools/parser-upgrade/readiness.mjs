#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const probes = [
  { name: "java", args: ["-version"], required: true },
  { name: "javac", args: ["-version"], required: true },
  { name: "mvn", args: ["-version"], required: true },
  { name: "gradle", args: ["-version"], required: false },
  { name: "native-image", args: ["--version"], required: false },
];

const results = probes.map((probe) => probeTool(probe));
const missingRequired = results.filter((result) => result.required && !result.available);

console.log(JSON.stringify({ ready: missingRequired.length === 0, tools: results }, null, 2));

if (missingRequired.length) {
  process.exitCode = 1;
}

function probeTool(probe) {
  const result = spawnSync(probe.name, probe.args, { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return {
    name: probe.name,
    required: probe.required,
    available: !result.error && result.status === 0,
    version: output.split(/\r?\n/).find(Boolean) ?? "",
    error: result.error?.message,
  };
}

