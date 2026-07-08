import { invoke } from "@tauri-apps/api/core";
import type { SourceExcerpt, SourceSnippet } from "./graph";
import { canUseTauri } from "./tauri";

export function sourceBaseForGraphUrl(graphUrl: string) {
  return graphUrl.includes("m6-bakeoff-graph.json") ? "/m6-bakeoff-source.json" : "";
}

export async function readSourceSnippet(
  root: string,
  sourceBase: string,
  browserSourceFiles: Record<string, string>,
  file: string,
  line: number,
  encoding: string,
): Promise<SourceSnippet> {
  if (root && canUseTauri()) {
    return invoke<SourceSnippet>("read_source_snippet", {
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

  const lines = text.split(/\r?\n/);
  // Generous window so the center Source view reads like a file (scrollable),
  // not a keyhole, while keeping the cited line near the top.
  const startLine = Math.max(1, line - 12);
  const endLine = Math.min(lines.length, line + 60);
  return {
    file,
    startLine,
    highlightLine: line,
    lines: lines.slice(startLine - 1, endLine).map((sourceLine, index) => ({
      number: startLine + index,
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

  const lines = text.split(/\r?\n/);
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
