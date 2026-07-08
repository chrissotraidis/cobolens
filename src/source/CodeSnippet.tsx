import type { GraphNode, SourceSnippet } from "../lib/graph";
import { padLine } from "../lib/sourceReader";
import { sourceLineClassName, sourceLineLabel, sourceLineMarker, sourceLineStateLabel } from "./sourceLineLabels";

export function CodeSnippet({
  node,
  snippet,
  loading,
  focusedCitation,
}: {
  node: GraphNode;
  snippet: SourceSnippet | null;
  loading: boolean;
  focusedCitation: boolean;
}) {
  const selectedRange =
    snippet && node.file === snippet.file && node.lines
      ? { start: node.lines[0], end: node.lines[1] ?? node.lines[0] }
      : null;

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
        <span>{snippet?.file ?? node.file}</span>
        <strong>{focusedCitation && snippet ? `citation line ${snippet.highlightLine}` : sourceLineLabel(node.lines, snippet?.highlightLine ?? 1)}</strong>
      </div>
      {snippet && focusedCitation ? (
        <div className="source-focus-note" role="status">
          Focused citation: {snippet.file}:{snippet.highlightLine}
        </div>
      ) : null}
      <pre>
        <code className={snippet ? "source-lines" : undefined}>
          {snippet ? (
            snippet.lines.map((line) => {
              const selectedRangeLine = Boolean(selectedRange && line.number >= selectedRange.start && line.number <= selectedRange.end);
              const focusedLine = line.number === snippet.highlightLine;
              const citationLine = focusedCitation && focusedLine;
              return (
                <span
                  key={line.number}
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
          ) : (
            loading
              ? "Loading source snippet..."
              : "Source snippet unavailable. Use Sample for the browser demo, or import the project in the desktop app."
          )}
        </code>
      </pre>
    </div>
  );
}
