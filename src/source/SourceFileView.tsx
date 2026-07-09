import { useEffect, useRef } from "react";
import type { GraphNode, SourceFileContent } from "../lib/graph";
import { padLine } from "../lib/sourceReader";
import { sourceLineClassName, sourceLineLabel, sourceLineMarker, sourceLineStateLabel } from "./sourceLineLabels";

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
  const selectedRange =
    source && node.file === source.file && node.lines
      ? { start: node.lines[0], end: node.lines[1] ?? node.lines[0] }
      : null;

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
    <div className={`source-view${focusedCitation ? " has-focused-citation" : ""}`}>
      <div className="source-header">
        <span>{source?.file ?? node.file}</span>
        <strong>{focusedCitation && source ? `citation line ${source.highlightLine}` : sourceLineLabel(node.lines, source?.highlightLine ?? 1)}</strong>
      </div>
      {source && focusedCitation ? (
        <div className="source-focus-note" role="status">
          Focused citation: {source.file}:{source.highlightLine}
        </div>
      ) : null}
      <pre>
        <code className={source ? "source-lines" : undefined}>
          {source ? (
            source.lines.map((line) => {
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
