import { invoke } from "@tauri-apps/api/core";
import type { SourceExcerpt, SourceFileContent } from "./graph";
import { canUseTauri } from "./tauri";

export function sourceBaseForGraphUrl(graphUrl: string) {
  return graphUrl.includes("m6-bakeoff-graph.json") ? "/m6-bakeoff-source.json" : "";
}

export const MAX_SOURCE_READER_BYTES = 2 * 1024 * 1024;

export async function readSourceFile(
  root: string,
  sourceBase: string,
  browserSourceFiles: Record<string, string>,
  file: string,
  line: number,
  encoding: string,
): Promise<SourceFileContent> {
  if (root && canUseTauri()) {
    return invoke<SourceFileContent>("read_source_file", {
      root,
      file,
      line,
      encoding,
    });
  }

  const text = await readSourceText(sourceBase, browserSourceFiles, file);
  if (text == null) {
    throw new Error("Source is unavailable for this graph. Use Sample or import the project in the desktop app.");
  }

  const byteCount = new TextEncoder().encode(text).byteLength;
  if (byteCount > MAX_SOURCE_READER_BYTES) {
    throw new Error(`Source file is too large to open safely (${byteCount} bytes; limit is ${MAX_SOURCE_READER_BYTES}).`);
  }
  const lines = splitSourceLines(text);
  return {
    file,
    highlightLine: Math.min(lines.length, Math.max(1, line)),
    lineCount: lines.length,
    byteCount,
    lines: lines.map((sourceLine, index) => ({
      number: index + 1,
      text: sourceLine,
    })),
  };
}

export async function readSourceExcerpt(
  root: string,
  sourceBase: string,
  browserSourceFiles: Record<string, string>,
  file: string,
  startLine: number,
  endLine: number,
  maxLines: number,
  encoding: string,
): Promise<SourceExcerpt> {
  if (root && canUseTauri()) {
    return invoke<SourceExcerpt>("read_source_excerpt", {
      root,
      file,
      startLine,
      endLine,
      maxLines,
      encoding,
    });
  }

  const text = await readSourceText(sourceBase, browserSourceFiles, file);
  if (text == null) {
    throw new Error("Source is unavailable for this graph. Use Sample or import the project in the desktop app.");
  }

  const lines = splitSourceLines(text);
  const safeStart = Math.max(1, startLine);
  const safeEnd = Math.min(lines.length, Math.max(safeStart, endLine));
  const cappedEnd = Math.min(safeEnd, safeStart + maxLines - 1);
  return {
    file,
    startLine: safeStart,
    endLine: cappedEnd,
    truncated: cappedEnd < safeEnd,
    text: lines
      .slice(safeStart - 1, cappedEnd)
      .map((sourceLine, index) => `${padLine(safeStart + index)} ${sourceLine}`)
      .join("\n"),
  };
}

async function readSourceText(sourceBase: string, browserSourceFiles: Record<string, string>, file: string) {
  if (Object.prototype.hasOwnProperty.call(browserSourceFiles, file)) {
    return browserSourceFiles[file];
  }
  if (!sourceBase) return null;
  return fetchSourceText(sourceBase, file);
}

async function fetchSourceText(sourceBase: string, file: string) {
  if (sourceBase.endsWith(".json")) {
    const bundle = await fetchSourceBundle(sourceBase);
    const text = bundle[file];
    if (text == null) {
      throw new Error(`Source file ${file} is not available in this browser demo.`);
    }
    return text;
  }

  const base = sourceBase.replace(/\/$/, "");
  const path = file
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  const response = await fetch(`${base}/${path}`);
  if (!response.ok) {
    throw new Error(`Source file ${file} is not available in this browser demo.`);
  }
  return response.text();
}

const sourceBundleCache = new Map<string, Promise<Record<string, string>>>();

function fetchSourceBundle(sourceBase: string) {
  let bundle = sourceBundleCache.get(sourceBase);
  if (!bundle) {
    bundle = fetch(sourceBase).then(async (response) => {
      if (!response.ok) throw new Error(`Source bundle ${sourceBase} is not available.`);
      return (await response.json()) as Record<string, string>;
    });
    sourceBundleCache.set(sourceBase, bundle);
  }
  return bundle;
}

export function padLine(line: number) {
  return line.toString().padStart(5, " ");
}

function splitSourceLines(text: string) {
  if (!text) return [""];
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
