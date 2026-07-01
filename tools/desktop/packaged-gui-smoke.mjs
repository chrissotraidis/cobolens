#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const launchTimeoutMs = Number(process.env.COBOLENS_PACKAGED_LAUNCH_TIMEOUT_MS ?? 25000);
const holdMs = Number(process.env.COBOLENS_PACKAGED_HOLD_MS ?? 8000);
const explicitApp = process.env.COBOLENS_PACKAGED_APP;
const gstPluginPath = "/usr/lib/x86_64-linux-gnu/gstreamer-1.0";
const gstPluginScanner = "/usr/lib/x86_64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner";
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

const resources = await appDirResourceSmoke(app);
report.appDirResources = resources;
for (const [name, passed] of Object.entries(resources.checks ?? {})) {
  report.checks[name] = passed;
}
if (!resources.ok) {
  report.error = resources.error ?? "packaged AppDir resources are incomplete";
  if (resources.hint) report.hints.push(resources.hint);
  finish(1);
}

const appsink = checkGstreamerAppsink();
report.checks["GStreamer appsink is available"] = appsink.ok;
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
    GST_PLUGIN_PATH_1_0: process.env.GST_PLUGIN_PATH_1_0 ?? (existsSync(gstPluginPath) ? gstPluginPath : undefined),
    GST_PLUGIN_SCANNER: process.env.GST_PLUGIN_SCANNER ?? (existsSync(gstPluginScanner) ? gstPluginScanner : undefined),
    GST_PLUGIN_SYSTEM_PATH_1_0: process.env.GST_PLUGIN_SYSTEM_PATH_1_0 ?? (existsSync(gstPluginPath) ? gstPluginPath : undefined),
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

async function appDirResourceSmoke(appPath) {
  const appDir = await newestAppDir(dirname(appPath));
  if (!appDir) {
    return {
      ok: false,
      checks: { "packaged AppDir exists": false },
      hint: "Run npm run tauri build so the AppImage AppDir is available for resource inspection.",
    };
  }

  const analyzerPath = resolve(appDir, "usr", "lib", "Cobolens", "cobolens-analyze");
  const sampleRoot = resolve(appDir, "usr", "lib", "Cobolens", "samples", "mini-bank");
  const checks = {
    "packaged AppDir exists": true,
    "AppImage analyzer sidecar exists": existsSync(analyzerPath),
    "AppImage mini-bank sample exists": existsSync(sampleRoot),
  };
  if (!checks["AppImage analyzer sidecar exists"] || !checks["AppImage mini-bank sample exists"]) {
    return { ok: false, appDir, analyzerPath, sampleRoot, checks };
  }

  const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-appimage-resource-"));
  try {
    const out = resolve(tempRoot, "mini-bank-graph.json");
    const result = await runAnalyzer(analyzerPath, sampleRoot, out);
    if (!result.ok) {
      return {
        ok: false,
        appDir,
        analyzerPath,
        sampleRoot,
        checks,
        error: `AppImage packaged analyzer exited with ${result.code}`,
        stderrTail: result.stderrLines.slice(-12),
      };
    }

    const graph = JSON.parse(await readFile(out, "utf8"));
    const graphChecks = {
      "AppImage sample files parsed": graph.meta?.fileCount > 0 && graph.meta?.parsedFileCount > 0,
      "AppImage sample graph has nodes": Array.isArray(graph.nodes) && graph.nodes.length > 0,
      "AppImage sample graph has edges": Array.isArray(graph.edges) && graph.edges.length > 0,
    };
    Object.assign(checks, graphChecks);
    return {
      ok: Object.values(checks).every(Boolean),
      appDir,
      analyzerPath,
      sampleRoot,
      checks,
      graph: {
        files: graph.meta?.fileCount ?? 0,
        parsed: graph.meta?.parsedFileCount ?? 0,
        parseErrors: graph.meta?.parseErrors?.length ?? 0,
        nodes: graph.nodes?.length ?? 0,
        edges: graph.edges?.length ?? 0,
      },
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function newestAppDir(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const dirs = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(".AppDir")) continue;
      const path = resolve(root, entry.name);
      const info = await stat(path);
      dirs.push({ path, mtimeMs: info.mtimeMs });
    }
    dirs.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return dirs[0]?.path ?? null;
  } catch {
    return null;
  }
}

function runAnalyzer(commandPath, root, out) {
  const args = [
    "--root",
    root,
    "--out",
    out,
    "--format",
    "auto",
    "--ext",
    ".cbl,.cob,.cpy,.jcl",
    "--encoding",
    "utf8",
  ];
  return new Promise((resolveRun) => {
    const stderrLines = [];
    const child = spawn(commandPath, args, { cwd: repoRoot });
    child.stderr.on("data", (chunk) => {
      stderrLines.push(...chunk.toString("utf8").trim().split(/\r?\n/).filter(Boolean));
    });
    child.stdout.on("data", () => {});
    child.on("error", (error) => {
      resolveRun({ ok: false, code: "spawn-error", stderrLines: [error.message] });
    });
    child.on("close", (code) => {
      resolveRun({ ok: code === 0, code, stderrLines });
    });
  });
}

function checkGstreamerAppsink() {
  const result = spawnSync("gst-inspect-1.0", ["appsink"], { encoding: "utf8" });
  if (result.error) {
    const pluginPath = `${gstPluginPath}/libgstapp.so`;
    if (result.error.code === "ENOENT" && existsSync(pluginPath)) {
      report.hints.push(
        `gst-inspect-1.0 is not installed, but ${pluginPath} exists; launching the app to verify the runtime directly.`,
      );
      return {
        ok: true,
        error: undefined,
        stderrTail: [],
      };
    }
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
