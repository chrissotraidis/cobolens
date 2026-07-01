#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { access, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const launchTimeoutMs = Number(process.env.COBOLENS_PACKAGED_LAUNCH_TIMEOUT_MS ?? 25000);
const holdMs = Number(process.env.COBOLENS_PACKAGED_HOLD_MS ?? 8000);
const explicitApp = process.env.COBOLENS_PACKAGED_APP;
const app = explicitApp ? resolve(repoRoot, explicitApp) : await newestAppImage();
const report = {
  ready: false,
  app,
  checks: {},
  hints: [],
  stderrTail: [],
  stdoutTail: [],
};

if (!app) {
  report.checks["packaged app exists"] = false;
  report.hints.push("Run npm run tauri build before packaged GUI smoke.");
  finish(1);
}

try {
  await access(app, constants.X_OK);
  report.checks["packaged app exists"] = true;
  report.checks["packaged app is executable"] = true;
} catch {
  report.checks["packaged app exists"] = false;
  report.hints.push(`Packaged app is missing or not executable: ${app}`);
  finish(1);
}

if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  report.checks["desktop display is available"] = false;
  report.hints.push("Run this smoke from a Linux desktop or WSLg session with DISPLAY or WAYLAND_DISPLAY set.");
  finish(1);
}
report.checks["desktop display is available"] = true;

const appsink = checkGstreamerAppsink();
report.checks["GStreamer appsink is inspectable"] = appsink.ok;
if (!appsink.ok) {
  report.error = appsink.error;
  report.stderrTail = appsink.stderrTail;
  report.hints.push(
    "Install GStreamer inspection/runtime pieces for packaged GUI smoke, for example gstreamer1.0-tools and gstreamer1.0-plugins-base.",
  );
  finish(1);
}

const child = spawn(app, [], {
  cwd: repoRoot,
  env: {
    ...process.env,
    NO_AT_BRIDGE: process.env.NO_AT_BRIDGE ?? "1",
    WEBKIT_DISABLE_DMABUF_RENDERER: process.env.WEBKIT_DISABLE_DMABUF_RENDERER ?? "1",
  },
});

let settled = false;
let childClosed = false;
const stdoutLines = [];
const stderrLines = [];
const launchTimer = setTimeout(() => {
  if (!settled) pass();
}, holdMs);
const hardTimeout = setTimeout(() => {
  if (!settled) fail(`packaged app did not settle within ${launchTimeoutMs}ms`);
}, launchTimeoutMs);

child.stdout.on("data", (chunk) => remember(stdoutLines, chunk));
child.stderr.on("data", (chunk) => remember(stderrLines, chunk));
child.on("error", (error) => {
  if (!settled) fail(error.message);
});
child.on("close", (code) => {
  childClosed = true;
  if (!settled) {
    fail(`packaged app exited before smoke completed with code ${code}`);
  }
});

function pass() {
  if (settled) return;
  const output = [...stderrLines, ...stdoutLines].join("\n");
  if (hasMissingRuntime(output)) {
    report.checks[`packaged app stayed alive for ${holdMs}ms`] = true;
    report.checks["WebKit/GStreamer runtime is complete"] = false;
    fail("packaged app reported missing WebKit/GStreamer runtime pieces");
    return;
  }
  settled = true;
  clearTimeout(launchTimer);
  clearTimeout(hardTimeout);
  report.ready = true;
  report.checks[`packaged app stayed alive for ${holdMs}ms`] = true;
  report.checks["WebKit/GStreamer runtime is complete"] = true;
  finishAfterKill(0);
}

function fail(message) {
  if (settled) return;
  settled = true;
  clearTimeout(launchTimer);
  clearTimeout(hardTimeout);
  report.ready = false;
  report.error = message;
  report.stderrTail = stderrLines.slice(-16);
  report.stdoutTail = stdoutLines.slice(-16);
  addRuntimeHints([...stderrLines, ...stdoutLines].join("\n"));
  finishAfterKill(1);
}

function finishAfterKill(code) {
  report.stderrTail = stderrLines.slice(-16);
  report.stdoutTail = stdoutLines.slice(-16);
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

function addRuntimeHints(output) {
  if (hasMissingRuntime(output)) {
    report.hints.push(
      "Install the WebKit/GStreamer runtime pieces for GUI smoke, for example gstreamer1.0-plugins-base, gstreamer1.0-plugins-good, and gstreamer1.0-libav.",
    );
  }
  if (/fuse|AppImage/i.test(output)) {
    report.hints.push("If AppImage launch fails on FUSE, try the extracted AppDir/AppRun or install the AppImage/FUSE runtime.");
  }
  if (/display|wayland|x11|gtk/i.test(output)) {
    report.hints.push("Run the smoke inside a visible Linux desktop session, not a headless shell.");
  }
}

function hasMissingRuntime(output) {
  return /appsink not found|GStreamer element appsink|gstreamer.+not found|gst.+not found/i.test(output);
}

async function newestAppImage() {
  const root = resolve(repoRoot, "src-tauri", "target", "release", "bundle", "appimage");
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".AppImage")) continue;
      const path = resolve(root, entry.name);
      const info = await stat(path);
      files.push({ path, mtimeMs: info.mtimeMs });
    }
    files.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return files[0]?.path ?? null;
  } catch {
    return null;
  }
}

function checkGstreamerAppsink() {
  const result = spawnSync("gst-inspect-1.0", ["appsink"], { encoding: "utf8" });
  if (result.error) {
    return {
      ok: false,
      error: result.error.code === "ENOENT"
        ? "gst-inspect-1.0 is not installed; cannot verify GStreamer appsink."
        : result.error.message,
      stderrTail: [],
    };
  }
  return {
    ok: result.status === 0,
    error: result.status === 0 ? undefined : "GStreamer appsink is not available.",
    stderrTail: tailLines(result.stderr),
  };
}

function tailLines(text, count = 16) {
  return text.split(/\r?\n/).filter(Boolean).slice(-count);
}

function remember(lines, chunk) {
  lines.push(...chunk.toString("utf8").split(/\r?\n/).filter(Boolean));
  if (lines.length > 60) lines.splice(0, lines.length - 60);
}

function finish(code) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(code);
}
