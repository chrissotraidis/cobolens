import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";

const DEFAULT_START_TIMEOUT_MS = 30_000;
const DEFAULT_START_ATTEMPTS = 2;
const DEFAULT_POLL_MS = 200;

export async function launchBrowser(cdpPort, userDataDir, options = {}) {
  const browserPath = options.browserPath ?? findBrowserPath(options.env ?? process.env);
  if (!browserPath) {
    throw new Error("Rendered UI smoke needs Chrome, Chromium, or Edge. Set CHROME_BIN to the browser executable.");
  }

  const attempts = positiveInteger(
    options.attempts ?? options.env?.COBOLENS_BROWSER_START_ATTEMPTS ?? process.env.COBOLENS_BROWSER_START_ATTEMPTS,
    DEFAULT_START_ATTEMPTS,
  );
  const timeoutMs = positiveInteger(
    options.timeoutMs ?? options.env?.COBOLENS_BROWSER_START_TIMEOUT_MS ?? process.env.COBOLENS_BROWSER_START_TIMEOUT_MS,
    DEFAULT_START_TIMEOUT_MS,
  );
  const pollMs = positiveInteger(options.pollMs, DEFAULT_POLL_MS);
  const spawnProcess = options.spawnProcess ?? spawn;
  const probeBrowser = options.probeBrowser ?? (() => httpJson(`http://127.0.0.1:${cdpPort}/json/version`));
  const pause = options.pause ?? ((delayMs) => new Promise((resolvePause) => setTimeout(resolvePause, delayMs)));
  const failures = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await launchAttempt({
      attempt,
      attempts,
      browserPath,
      cdpPort,
      userDataDir: join(userDataDir, `attempt-${attempt}`),
      timeoutMs,
      pollMs,
      spawnProcess,
      probeBrowser,
      pause,
    });
    if (result.ready) return result.child;
    stopChild(result.child, result.hasExited);
    failures.push(formatAttemptFailure(result));
    if (attempt < attempts) await pause(Math.min(500, pollMs));
  }

  throw new Error([
    `Rendered UI browser failed to start after ${attempts} attempts (${timeoutMs}ms each).`,
    `Browser: ${browserPath}`,
    ...failures,
  ].join("\n"));
}

export function findBrowserPath(env = process.env) {
  const envPath = env.CHROME_BIN || env.CHROMIUM_BIN;
  if (envPath && existsSync(envPath)) return envPath;
  const candidates = process.platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      ]
    : process.platform === "win32"
      ? [
          join(env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
          join(env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/usr/bin/microsoft-edge",
        ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function launchAttempt({
  attempt,
  attempts,
  browserPath,
  cdpPort,
  userDataDir,
  timeoutMs,
  pollMs,
  spawnProcess,
  probeBrowser,
  pause,
}) {
  const child = spawnProcess(browserPath, browserArguments(cdpPort, userDataDir), {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  let hasExited = false;
  let exitCode = null;
  let exitSignal = null;
  let spawnError = "";
  let lastProbeError = "";

  child.stderr?.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-4_000);
  });
  child.once("error", (error) => {
    spawnError = error.message;
  });
  child.once("exit", (code, signal) => {
    hasExited = true;
    exitCode = code;
    exitSignal = signal;
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (spawnError || hasExited) break;
    try {
      await probeBrowser();
      return { ready: true, child };
    } catch (error) {
      lastProbeError = error instanceof Error ? error.message : String(error);
    }
    await pause(pollMs);
  }

  return {
    ready: false,
    child,
    attempt,
    attempts,
    elapsedMs: Date.now() - startedAt,
    timeoutMs,
    hasExited,
    exitCode,
    exitSignal,
    spawnError,
    lastProbeError,
    stderr: stderr.trim(),
  };
}

function browserArguments(cdpPort, userDataDir) {
  return [
    "--headless=new",
    "--ignore-gpu-blocklist",
    "--use-gl=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-background-networking",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-sandbox",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ];
}

function formatAttemptFailure(result) {
  const status = result.spawnError
    ? `spawn error: ${result.spawnError}`
    : result.hasExited
      ? `browser exited with code ${result.exitCode ?? "unknown"}${result.exitSignal ? ` (${result.exitSignal})` : ""}`
      : `timed out after ${result.elapsedMs}ms`;
  const details = [`Attempt ${result.attempt}/${result.attempts}: ${status}.`];
  if (result.lastProbeError) details.push(`Last debugging-port error: ${result.lastProbeError}`);
  if (result.stderr) details.push(`Browser stderr: ${result.stderr}`);
  return details.join("\n");
}

function stopChild(child, hasExited) {
  if (!hasExited) child.kill?.("SIGTERM");
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function httpJson(url) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if ((response.statusCode ?? 500) >= 400) {
          rejectRequest(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolveRequest(JSON.parse(body));
        } catch (error) {
          rejectRequest(error);
        }
      });
    });
    request.on("error", rejectRequest);
    request.setTimeout(1_000, () => request.destroy(new Error("debugging-port request timed out")));
  });
}
