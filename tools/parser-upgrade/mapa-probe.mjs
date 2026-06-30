#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureRoot = resolve(repoRoot, "fixtures", "m6-bakeoff");
const mapaRepo = "https://github.com/cschneid-the-elder/mapa.git";

const options = parseArgs(process.argv.slice(2));
const java = findJava21();
if (!java) {
  console.error("JDK 21 is required for mapa's checked-in jars. Install it under $COBOLENS_JVM_HOME/jdk-21 or put java 21 on PATH.");
  process.exit(1);
}

const mapaHome = ensureMapaHome(options.mapaHome);
const scratch = await mkdtemp(join(tmpdir(), "cobolens-mapa-probe-"));

try {
  const copyDir = await normalizedCopybookDir(scratch);
  const cobolCsv = join(scratch, "calltree.csv");
  const jclCsv = join(scratch, "jcl.csv");
  const jclTree = join(scratch, "jcl.tsv");

  run("mapa COBOL CallTree", java, [
    "-jar",
    join(mapaHome, "cobol", "CallTree.jar"),
    "-file",
    join(fixtureRoot, "src", "LINEAGE.cbl"),
    "-copy",
    copyDir,
    "-out",
    cobolCsv,
  ]);

  run("mapa JCL parser", java, [
    "-jar",
    join(mapaHome, "jcl", "JCLParser.jar"),
    "-file",
    join(fixtureRoot, "jcl", "DAILYLN.jcl"),
    "-include",
    join(fixtureRoot, "jcl"),
    "-outcsv",
    jclCsv,
    "-outtree",
    jclTree,
  ]);

  const cobolRows = parseCsv(await readFile(cobolCsv, "utf8"));
  const jclRows = parseCsv(await readFile(jclCsv, "utf8"));
  const failures = validate(cobolRows, jclRows);
  if (failures.length) {
    console.log("FAIL mapa probe");
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("PASS mapa probe");
    console.log(JSON.stringify(summary(cobolRows, jclRows), null, 2));
  }
} finally {
  if (!options.keepTemp) {
    await rm(scratch, { recursive: true, force: true });
  } else {
    console.log(`kept temp output: ${scratch}`);
  }
}

function parseArgs(args) {
  const parsed = { mapaHome: process.env.MAPA_HOME, keepTemp: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--keep-temp") {
      parsed.keepTemp = true;
      continue;
    }
    if (arg === "--mapa-home") {
      parsed.mapaHome = args[index + 1];
      if (!parsed.mapaHome) throw new Error("--mapa-home requires a path");
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}

function findJava21() {
  const localJvmHome = process.env.COBOLENS_JVM_HOME ?? join(homedir(), ".local", "codex-jvm");
  const candidates = [
    join(localJvmHome, "jdk-21", "bin", "java"),
    process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", "java") : "",
    "java",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["-version"], { encoding: "utf8" });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (!result.error && result.status === 0 && javaMajor(output) >= 21) {
      return candidate;
    }
  }
  return null;
}

function javaMajor(output) {
  const match = output.match(/version "(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function ensureMapaHome(configuredHome) {
  const home = configuredHome ? resolve(configuredHome) : resolve(repoRoot, ".cache", "parser-upgrade", "mapa");
  if (existsSync(join(home, "cobol", "CallTree.jar")) && existsSync(join(home, "jcl", "JCLParser.jar"))) {
    return home;
  }
  if (configuredHome) {
    throw new Error(`MAPA_HOME does not contain expected jars: ${home}`);
  }

  mkdirSync(resolve(repoRoot, ".cache", "parser-upgrade"));
  run("clone mapa", "git", ["clone", "--depth", "1", mapaRepo, home]);
  return home;
}

function mkdirSync(path) {
  const result = spawnSync("mkdir", ["-p", path], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `failed to create ${path}`);
  }
}

async function normalizedCopybookDir(scratch) {
  const sourceDir = join(fixtureRoot, "copybook");
  const targetDir = join(scratch, "copybook");
  await mkdir(targetDir, { recursive: true });
  for (const entry of await readdir(sourceDir)) {
    const source = join(sourceDir, entry);
    await copyFile(source, join(targetDir, basename(entry, extname(entry))));
  }
  return targetDir;
}

function run(name, command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: linuxPath(),
    },
  });
  if (result.stdout.trim()) {
    console.log(result.stdout.trim());
  }
  if (result.stderr.trim()) {
    console.error(result.stderr.trim());
  }
  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed: ${result.error?.message ?? result.status}`);
  }
}

function linuxPath() {
  const localJvmHome = process.env.COBOLENS_JVM_HOME ?? join(homedir(), ".local", "codex-jvm");
  return [
    join(localJvmHome, "jdk-21", "bin"),
    join(localJvmHome, "jdk-17", "bin"),
    join(localJvmHome, "maven", "bin"),
    join(homedir(), ".local", "codex-node", "node-v24.14.0-linux-x64", "bin"),
    "/usr/local/sbin",
    "/usr/local/bin",
    "/usr/sbin",
    "/usr/bin",
    "/sbin",
    "/bin",
  ].join(":");
}

function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(parseCsvLine);
}

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    if (ch === '"' && line[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function validate(cobolRows, jclRows) {
  const failures = [];
  if (!cobolRows.some((row) => row[0] === "PGM" && row[3] === "LINEAGE")) failures.push("missing COBOL PGM LINEAGE");
  if (!cobolRows.some((row) => row[0] === "COPY" && row[3] === "CUSTOMER")) failures.push("missing COPY CUSTOMER");
  if (!cobolRows.some((row) => row[0] === "CALL" && row[4] === "CICSLINKBYLITERAL" && row[5] === "RATEAPI")) failures.push("missing CICS LINK RATEAPI");
  if (!cobolRows.some((row) => row[0] === "DD" && row[3] === "CUSTIN" && row[5] === "1")) failures.push("missing CUSTIN input DD");
  if (!cobolRows.some((row) => row[0] === "DD" && row[3] === "RPTFILE" && row[6] === "1")) failures.push("missing RPTFILE output DD");
  if (!cobolRows.some((row) => row[0] === "DB2TABLE" && row[3] === "CUSTOMER_TABLE")) failures.push("missing DB2 CUSTOMER_TABLE");

  if (!jclRows.some((row) => row[0] === "JOB" && row[1] === "DAILYLN")) failures.push("missing JCL JOB DAILYLN");
  if (!jclRows.some((row) => row[0] === "JOBSTEP" && row[1] === "STEP010" && row[6] === "LINEAGE")) failures.push("missing JCL STEP010 PGM LINEAGE");
  if (!jclRows.some((row) => row[0] === "JOBSTEPDD" && row[1] === "CUSTIN" && row[6] === "BANK.CUSTOMER.MASTER")) failures.push("missing JCL CUSTIN dataset");
  if (!jclRows.some((row) => row[0] === "JOBSTEPDD" && row[1] === "RPTFILE" && row[6] === "BANK.REPORT.DAILY")) failures.push("missing JCL RPTFILE dataset");
  return failures;
}

function summary(cobolRows, jclRows) {
  return {
    cobolRecords: countTypes(cobolRows),
    jclRecords: countTypes(jclRows),
  };
}

function countTypes(rows) {
  return rows.reduce((counts, row) => {
    counts[row[0]] = (counts[row[0]] ?? 0) + 1;
    return counts;
  }, {});
}
