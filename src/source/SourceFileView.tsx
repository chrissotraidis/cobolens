import { useEffect, useRef, useState } from "react";
import type { GraphNode, SourceFileContent } from "../lib/graph";
import { padLine } from "../lib/sourceReader";
import { sourceLineClassName, sourceLineLabel, sourceLineMarker, sourceLineStateLabel } from "./sourceLineLabels";

const SOURCE_PAGE_SIZE = 240;

export function SourceFileView({
  node,
  source,
  loading,
  error,
  focusedCitation,
}: {
  node: GraphNode;
  source: SourceFileContent | null;
  loading: boolean;
  error: string;
  focusedCitation: boolean;
}) {
  const highlightedLineRef = useRef<HTMLSpanElement>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const selectedRangeSpan = node.lines ? (node.lines[1] ?? node.lines[0]) - node.lines[0] + 1 : 0;
  const selectedRange =
    source && node.file === source.file && node.lines && selectedRangeSpan <= 24
      ? { start: node.lines[0], end: node.lines[1] ?? node.lines[0] }
      : null;
  const pageCount = source ? Math.max(1, Math.ceil(source.lineCount / SOURCE_PAGE_SIZE)) : 1;
  const safePageIndex = Math.min(pageCount - 1, pageIndex);
  const pageStart = safePageIndex * SOURCE_PAGE_SIZE;
  const visibleLines = source?.lines.slice(pageStart, pageStart + SOURCE_PAGE_SIZE) ?? [];
  const visibleStartLine = visibleLines[0]?.number ?? 1;
  const visibleEndLine = visibleLines[visibleLines.length - 1]?.number ?? source?.lineCount ?? 1;

  useEffect(() => {
    if (!source) return;
    setPageIndex(Math.floor((source.highlightLine - 1) / SOURCE_PAGE_SIZE));
  }, [source?.file, source?.highlightLine]);

  useEffect(() => {
    if (!source) return;
    const frame = window.requestAnimationFrame(() => {
      highlightedLineRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [source?.file, source?.highlightLine]);

  if (!node.file) {
    return (
      <pre>
        <code>{node.external ? "External node: source not present in this codebase." : "No source location."}</code>
      </pre>
    );
  }

  return (
    <div className={`source-view${pageCount === 1 ? " is-single-page" : ""}${focusedCitation ? " has-focused-citation" : ""}`}>
      <div className="source-header">
        <span>{source?.file ?? node.file}</span>
        <div className="source-header-location">
          <strong>{focusedCitation && source ? `citation line ${source.highlightLine}` : sourceLineLabel(node.lines, source?.highlightLine ?? 1)}</strong>
          {source && pageCount > 1 ? (
            <div className="source-page-controls" aria-label="Source pages">
              <button type="button" onClick={() => setPageIndex((current) => Math.max(0, current - 1))} disabled={safePageIndex === 0}>Previous</button>
              <span>Lines {visibleStartLine}–{visibleEndLine} of {source.lineCount}</span>
              <button type="button" onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))} disabled={safePageIndex === pageCount - 1}>Next</button>
            </div>
          ) : null}
        </div>
      </div>
      {source && focusedCitation ? (
        <div className="source-focus-note" role="status">
          Focused citation: {source.file}:{source.highlightLine}
        </div>
      ) : null}
      <pre>
        <code className={source ? "source-lines" : undefined}>
          {source ? (
            visibleLines.map((line) => {
              const selectedRangeLine = Boolean(selectedRange && line.number >= selectedRange.start && line.number <= selectedRange.end);
              const focusedLine = line.number === source.highlightLine;
              const citationLine = focusedCitation && focusedLine;
              return (
                <span
                  key={line.number}
                  ref={focusedLine ? highlightedLineRef : undefined}
                  className={sourceLineClassName(selectedRangeLine, focusedLine, citationLine)}
                  aria-label={`Line ${line.number}${sourceLineStateLabel(selectedRangeLine, focusedLine, citationLine)}: ${line.text || "blank"}`}
                >
                  <span className="source-line-marker" aria-hidden="true">
                    {sourceLineMarker(selectedRangeLine, focusedLine, citationLine)}
                  </span>
                  <span className="source-line-number">{padLine(line.number)}</span>
                  {citationLine ? <span className="sr-only">Focused citation line</span> : null}
                  <span className="source-line-text">{line.text || " "}</span>
                </span>
              );
            })
          ) : loading ? (
            "Loading source file..."
          ) : error ? (
            <span className="source-load-error" role="alert">{error}</span>
          ) : (
            "Source file unavailable. Use Sample for the browser demo, or import the project in the desktop app."
          )}
        </code>
      </pre>
    </div>
  );
}
