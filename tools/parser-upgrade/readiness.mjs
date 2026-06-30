#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const localJvmHome = process.env.COBOLENS_JVM_HOME ?? join(homedir(), ".local", "codex-jvm");
const localJdk = join(localJvmHome, "jdk-17");
const localMaven = join(localJvmHome, "maven");

const probes = [
  { name: "java", args: ["-version"], required: true, fallback: join(localJdk, "bin", "java") },
  { name: "javac", args: ["-version"], required: true, fallback: join(localJdk, "bin", "javac") },
  { name: "mvn", args: ["-version"], required: true, fallback: join(localMaven, "bin", "mvn") },
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
  const command = probe.fallback && existsSync(probe.fallback) ? probe.fallback : probe.name;
  const env = {
    ...process.env,
    JAVA_HOME: process.env.JAVA_HOME ?? (existsSync(localJdk) ? localJdk : undefined),
  };
  const result = spawnSync(command, probe.args, { encoding: "utf8", env });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return {
    name: probe.name,
    required: probe.required,
    available: !result.error && result.status === 0,
    command,
    version: output.split(/\r?\n/).find(Boolean) ?? "",
    error: result.error?.message,
  };
}
