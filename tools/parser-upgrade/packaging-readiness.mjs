#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureRoot = resolve(repoRoot, "fixtures", "m6-bakeoff");
const candidates = [
  ["rust", resolve(repoRoot, "sidecar", "cobolens-analyze", "target", "debug", "cobolens-analyze")],
  ["proleap", resolve(repoRoot, "sidecar", "cobolens-analyze-jvm", "bin", "cobolens-analyze-jvm")],
  ["mapa", resolve(repoRoot, "sidecar", "cobolens-analyze-mapa", "bin", "cobolens-analyze-mapa")],
];

const report = {
  ready: true,
  tauriLinuxSystemDeps: checkTauriLinuxDeps(),
  windowsHost: checkWindowsHost(),
  artifacts: await artifactReport(),
  startupSmoke: await startupReport(),
  packagedDebSmoke: await packagedDebSmoke(),
};

report.ready =
  (report.tauriLinuxSystemDeps.ready || report.windowsHost.ready) &&
  report.startupSmoke.every((entry) => entry.ok) &&
  (report.packagedDebSmoke.skipped || report.packagedDebSmoke.ok);

console.log(JSON.stringify(report, null, 2));

if (!report.ready) {
  process.exit(1);
}

function checkTauriLinuxDeps() {
  const pkgConfig = command(["pkg-config", "--version"]);
  const packages = ["dbus-1", "webkit2gtk-4.1", "javascriptcoregtk-4.1", "libsoup-3.0"];
  const checked = packages.map((name) => ({
    name,
    available: pkgConfig.ok && spawnSync("pkg-config", ["--exists", name], { encoding: "utf8" }).status === 0,
  }));
  return {
    ready: pkgConfig.ok && checked.every((entry) => entry.available),
    pkgConfig: pkgConfig.ok ? pkgConfig.stdout.trim() : null,
    packages: checked,
    note: "This only probes local WSL Linux build prerequisites; Windows packaging must still be validated on Windows.",
  };
}

function checkWindowsHost() {
  const probe = windowsCommand("ver");
  if (!probe.ok) {
    return {
      available: false,
      ready: false,
      tools: [],
      visualCppBuildTools: { available: false },
      webView2: { available: false },
      vbScriptForMsi: { available: false },
      note: "Windows host tooling was not reachable from this environment.",
    };
  }

  const tools = ["node", "npm", "cargo", "rustc"].map((name) => {
    const found = windowsCommand(`where ${name}`);
    return {
      name,
      available: found.ok,
      path: found.ok ? firstLine(found.stdout) : null,
    };
  });
  const visualCppBuildTools = checkWindowsVisualCppBuildTools();
  const webView2 = checkWindowsWebView2();
  const cscript = windowsCommand("where cscript");
  const vbScriptForMsi = {
    available: cscript.ok,
    path: cscript.ok ? firstLine(cscript.stdout) : null,
  };

  return {
    available: true,
    ready:
      tools.every((entry) => entry.available) &&
      visualCppBuildTools.available &&
      webView2.available &&
      vbScriptForMsi.available,
    tools,
    visualCppBuildTools,
    webView2,
    vbScriptForMsi,
    note: "Tauri Windows prerequisites are Microsoft C++ Build Tools and WebView2; VBSCRIPT is included because bundle.targets is all/MSI.",
  };
}

function checkWindowsVisualCppBuildTools() {
  const vswhere = windowsCommand(
    'if exist "%ProgramFiles(x86)%\\Microsoft Visual Studio\\Installer\\vswhere.exe" "%ProgramFiles(x86)%\\Microsoft Visual Studio\\Installer\\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Workload.VCTools -property installationPath',
  );
  if (vswhere.ok && vswhere.stdout.trim()) {
    return { available: true, source: "vswhere", path: firstLine(vswhere.stdout) };
  }

  const cl = windowsCommand("where cl");
  return {
    available: cl.ok,
    source: cl.ok ? "PATH" : "not-found",
    path: cl.ok ? firstLine(cl.stdout) : null,
  };
}

function checkWindowsWebView2() {
  const keys = [
    "HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  ];

  for (const key of keys) {
    const result = windowsCommand(`reg query "${key}" /v pv`);
    if (result.ok) {
      return {
        available: true,
        registryKey: key,
        version: parseRegistryValue(result.stdout, "pv"),
      };
    }
  }

  return { available: false };
}

async function artifactReport() {
  return [
    await fileArtifact("rust analyzer", resolve(repoRoot, "sidecar", "cobolens-analyze", "target", "debug", "cobolens-analyze")),
    await fileArtifact("ProLeap shaded jar", resolve(repoRoot, "sidecar", "cobolens-analyze-jvm", "target", "cobolens-analyze-jvm-0.1.0.jar")),
    await directoryArtifact("mapa cached jars", resolve(repoRoot, ".cache", "parser-upgrade", "mapa"), (path) => path.endsWith(".jar")),
    await directoryArtifact("local JDK 17", resolve(home(), ".local", "codex-jvm", "jdk-17")),
    await directoryArtifact("local JDK 21", resolve(home(), ".local", "codex-jvm", "jdk-21")),
  ];
}

async function startupReport() {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-packaging-smoke-"));
  try {
    const results = [];
    for (const [name, commandPath] of candidates) {
      const out = resolve(tempRoot, `${name}.json`);
      const started = performance.now();
      const result = await runAnalyzer(commandPath, fixtureRoot, out);
      results.push({
        name,
        ok: result.ok,
        elapsedMs: Math.round(performance.now() - started),
        error: result.ok ? undefined : `exited with ${result.code}`,
        stderrTail: result.stderrLines.slice(-8),
      });
    }
    return results;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function fileArtifact(name, path) {
  try {
    const info = await stat(path);
    return { name, path, exists: true, bytes: info.size };
  } catch {
    return { name, path, exists: false, bytes: 0 };
  }
}

async function directoryArtifact(name, path, filter = () => true) {
  try {
    await access(path, constants.R_OK);
  } catch {
    return { name, path, exists: false, bytes: 0 };
  }
  return { name, path, exists: true, bytes: await directoryBytes(path, filter) };
}

async function directoryBytes(path, filter) {
  let bytes = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      bytes += await directoryBytes(child, filter);
    } else if (entry.isFile() && filter(child)) {
      bytes += (await stat(child)).size;
    }
  }
  return bytes;
}

async function packagedDebSmoke() {
  const bundle = await newestBundleArtifact(resolve(repoRoot, "src-tauri", "target", "release", "bundle", "deb"), ".deb");
  if (!bundle) {
    return {
      ok: true,
      skipped: true,
      reason: "No .deb bundle found. Run npm run tauri build before validating packaged resources.",
    };
  }

  const dpkgDeb = command(["dpkg-deb", "--version"]);
  if (!dpkgDeb.ok) {
    return {
      ok: false,
      skipped: false,
      bundle,
      error: "dpkg-deb is required to inspect the Linux package artifact.",
    };
  }

  const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-packaged-deb-"));
  try {
    const extractRoot = resolve(tempRoot, "root");
    const extract = spawnSync("dpkg-deb", ["-x", bundle, extractRoot], { encoding: "utf8" });
    if (extract.status !== 0) {
      return {
        ok: false,
        skipped: false,
        bundle,
        error: "dpkg-deb extraction failed",
        stderrTail: tailLines(extract.stderr),
      };
    }

    const analyzerPath = resolve(extractRoot, "usr", "lib", "Cobolens", "cobolens-analyze");
    const sampleRoot = resolve(extractRoot, "usr", "lib", "Cobolens", "samples", "mini-bank");
    const analyzer = await fileArtifact("packaged analyzer", analyzerPath);
    const sample = await directoryArtifact("packaged mini-bank sample", sampleRoot);
    if (!analyzer.exists || !sample.exists) {
      return {
        ok: false,
        skipped: false,
        bundle,
        analyzer,
        sample,
      };
    }

    const out = resolve(tempRoot, "packaged-sample-graph.json");
    const result = await runAnalyzer(analyzerPath, sampleRoot, out);
    if (!result.ok) {
      return {
        ok: false,
        skipped: false,
        bundle,
        analyzer,
        sample,
        error: `packaged analyzer exited with ${result.code}`,
        stderrTail: result.stderrLines.slice(-8),
      };
    }

    const graph = JSON.parse(await readFile(out, "utf8"));
    const checks = {
      "sample files parsed": graph.meta?.fileCount > 0 && graph.meta?.parsedFileCount > 0,
      "graph has nodes": Array.isArray(graph.nodes) && graph.nodes.length > 0,
      "graph has edges": Array.isArray(graph.edges) && graph.edges.length > 0,
      "parse warnings are graceful": Array.isArray(graph.meta?.parseErrors),
    };

    return {
      ok: Object.values(checks).every(Boolean),
      skipped: false,
      bundle,
      analyzer,
      sample,
      graph: {
        files: graph.meta?.fileCount ?? 0,
        parsed: graph.meta?.parsedFileCount ?? 0,
        parseErrors: graph.meta?.parseErrors?.length ?? 0,
        nodes: graph.nodes?.length ?? 0,
        edges: graph.edges?.length ?? 0,
      },
      checks,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      bundle,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function newestBundleArtifact(root, suffix) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(suffix)) continue;
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
    const child = spawn(commandPath, args, { cwd: repoRoot, env: linuxEnv() });
    const stderrLines = [];
    child.stdout.on("data", () => {});
    child.stderr.on("data", (chunk) => {
      stderrLines.push(...chunk.toString("utf8").trim().split(/\r?\n/).filter(Boolean));
    });
    child.on("error", (error) => {
      resolveRun({ ok: false, code: "spawn-error", stderrLines: [error.message] });
    });
    child.on("close", (code) => {
      resolveRun({ ok: code === 0, code, stderrLines });
    });
  });
}

function command(args) {
  const [name, ...rest] = args;
  const result = spawnSync(name, rest, { encoding: "utf8" });
  return {
    ok: !result.error && result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function windowsCommand(commandLine) {
  const result = spawnSync(windowsCmd(), ["/d", "/s", "/c", `cd /d C:\\Windows && ${commandLine}`], {
    encoding: "utf8",
  });
  return {
    ok: !result.error && result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function windowsCmd() {
  return process.env.COMSPEC ?? "/mnt/c/Windows/System32/cmd.exe";
}

function firstLine(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

function parseRegistryValue(text, name) {
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.toLowerCase().startsWith(name.toLowerCase() + " "));
  if (!line) return null;
  const parts = line.split(/\s+/);
  return parts.length >= 3 ? parts.slice(2).join(" ") : null;
}

function tailLines(text, count = 8) {
  return text.split(/\r?\n/).filter(Boolean).slice(-count);
}

function linuxEnv() {
  const localRoot = `${home()}/.local`;
  const localJvm = process.env.COBOLENS_JVM_HOME ?? `${localRoot}/codex-jvm`;
  return {
    ...process.env,
    PATH: [
      `${localRoot}/codex-node/node-v24.14.0-linux-x64/bin`,
      `${localJvm}/jdk-21/bin`,
      `${localJvm}/jdk-17/bin`,
      `${localJvm}/maven/bin`,
      `${home()}/.cargo/bin`,
      "/usr/local/sbin",
      "/usr/local/bin",
      "/usr/sbin",
      "/usr/bin",
      "/sbin",
      "/bin",
    ].join(":"),
  };
}

function home() {
  return process.env.HOME ?? "";
}
