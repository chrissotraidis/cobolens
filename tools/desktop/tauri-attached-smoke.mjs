#!/usr/bin/env node
import { spawn } from "node:child_process";

const devUrl = process.env.COBOLENS_DEV_URL ?? "http://127.0.0.1:1420";
const launchTimeoutMs = Number(process.env.COBOLENS_DESKTOP_LAUNCH_TIMEOUT_MS ?? 25000);
const holdMs = Number(process.env.COBOLENS_DESKTOP_HOLD_MS ?? 8000);
const report = {
  ready: false,
  devUrl,
  checks: {},
  hints: [],
  stderrTail: [],
  stdoutTail: [],
};

try {
  const response = await fetch(devUrl, { signal: AbortSignal.timeout(2000) });
  report.checks["dev server is reachable"] = response.ok;
  if (!response.ok) {
    report.hints.push(`Dev server responded with ${response.status}; start it with: npm run dev -- --host 127.0.0.1 --port 1420`);
    finish(1);
  }
} catch (error) {
  report.checks["dev server is reachable"] = false;
  report.hints.push("Start the Vite dev server first: npm run dev -- --host 127.0.0.1 --port 1420");
  report.error = error instanceof Error ? error.message : String(error);
  finish(1);
}

const child = spawn("cargo", ["run", "--no-default-features", "--color", "never", "--"], {
  cwd: "src-tauri",
  env: {
    ...process.env,
    NO_AT_BRIDGE: process.env.NO_AT_BRIDGE ?? "1",
  },
});

let settled = false;
let launched = false;
let childClosed = false;
const stdoutLines = [];
const stderrLines = [];
const launchTimer = setTimeout(() => {
  if (!settled) fail(`desktop shell did not launch within ${launchTimeoutMs}ms`);
}, launchTimeoutMs);

child.stdout.on("data", (chunk) => {
  remember(stdoutLines, chunk);
  maybeMarkLaunched();
});
child.stderr.on("data", (chunk) => {
  remember(stderrLines, chunk);
  maybeMarkLaunched();
});
child.on("error", (error) => {
  if (!settled) fail(error.message);
});
child.on("close", (code) => {
  childClosed = true;
  if (!settled) fail(`desktop shell exited before smoke completed with code ${code}`);
});

function maybeMarkLaunched() {
  if (launched || settled) return;
  const combined = [...stdoutLines, ...stderrLines].join("\n");
  if (!combined.includes("Running `target/") && !combined.includes("Running target/")) return;

  launched = true;
  report.checks["desktop shell process launched"] = true;
  setTimeout(() => pass(), holdMs);
}

function pass() {
  if (settled) return;
  settled = true;
  clearTimeout(launchTimer);
  report.ready = true;
  report.checks[`desktop shell stayed alive for ${holdMs}ms`] = true;
  finishAfterKill(0);
}

function fail(message) {
  if (settled) return;
  settled = true;
  clearTimeout(launchTimer);
  report.ready = false;
  report.error = message;
  report.stderrTail = stderrLines.slice(-12);
  report.stdoutTail = stdoutLines.slice(-12);
  finishAfterKill(1);
}

function finishAfterKill(code) {
  report.stderrTail = stderrLines.slice(-12);
  report.stdoutTail = stdoutLines.slice(-12);
  if (childClosed) {
    finish(code);
    return;
  }
  if (!child.killed) child.kill("SIGTERM");
  const hardKill = setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 1500);
  child.once("close", () => {
    clearTimeout(hardKill);
    finish(code);
  });
}

function finish(code) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(code);
}

function remember(lines, chunk) {
  lines.push(...chunk.toString("utf8").split(/\r?\n/).filter(Boolean));
  if (lines.length > 40) lines.splice(0, lines.length - 40);
}
