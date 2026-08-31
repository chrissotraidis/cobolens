import { useState } from "react";
import type { ReactNode } from "react";
import type { Citation } from "../retrieval/context";

const EVIDENCE_PREVIEW_LIMIT = 3;

export function EvidenceList({
  citations,
  onOpenCitation,
}: {
  citations: Citation[];
  onOpenCitation: (citation: Citation) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!citations.length) return null;

  const hasMore = citations.length > EVIDENCE_PREVIEW_LIMIT;
  const visibleCitations = hasMore && !expanded ? citations.slice(0, EVIDENCE_PREVIEW_LIMIT) : citations;
  const hiddenCount = citations.length - visibleCitations.length;

  return (
    <div className="evidence-block">
      <span className="evidence-heading">
        Evidence
        <small>{hasMore ? `showing ${visibleCitations.length} of ${citations.length}` : "click to open in Source"}</small>
      </span>
      <CitationList citations={visibleCitations} onOpenCitation={onOpenCitation} />
      {hasMore ? (
        <button type="button" className="evidence-more-toggle" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Show fewer evidence rows" : `Show ${hiddenCount} more`}
        </button>
      ) : null}
    </div>
  );
}

export function MessageText({ text }: { text: string }) {
  const blocks = textBlocks(text);

  return (
    <div className="message-text">
      {blocks.map((block, index) =>
        block.type === "list" ? (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={`${index}:${itemIndex}`}>
                <InlineMessageText text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <InlineMessageText text={block.text} />
          </p>
        ),
      )}
    </div>
  );
}

type MessageTextBlock = { type: "paragraph"; text: string } | { type: "list"; items: string[] };
type InlineSegment = { type: "text" | "strong" | "em" | "code"; text: string };

function InlineMessageText({ text }: { text: string }) {
  return <>{inlineSegments(cleanInlineText(text)).map((segment, index) => renderInlineSegment(segment, index))}</>;
}

function renderInlineSegment(segment: InlineSegment, index: number): ReactNode {
  if (segment.type === "strong") return <strong key={index}>{segment.text}</strong>;
  if (segment.type === "em") return <em key={index}>{segment.text}</em>;
  if (segment.type === "code") return <code key={index}>{segment.text}</code>;
  return segment.text;
}

function inlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /(`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index == null) continue;
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    if (match[2]) segments.push({ type: "code", text: match[2] });
    else if (match[3]) segments.push({ type: "strong", text: match[3] });
    else if (match[4]) segments.push({ type: "em", text: match[4] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: "text", text: text.slice(lastIndex) });
  return segments;
}

function cleanInlineText(text: string) {
  return text.replace(/\bfile:([\w./-]+\.[A-Za-z][A-Za-z0-9]*:\d+(?:-\d+)?)/g, "$1");
}

function textBlocks(text: string): MessageTextBlock[] {
  const blocks: MessageTextBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({ type: "list", items: listItems });
    listItems = [];
  };

  // Models return bullets with several markers (-, *, •), sometimes several on
  // one line ("* A. * B."). Normalize them all to newline-prefixed "- " so the
  // answer renders as a real list instead of a run-on paragraph.
  const normalized = text
    .replace(/([)\].:;!?])\s+[*•]\s+/g, "$1\n- ")
    .replace(/^\s*[*•]\s+/gm, "- ");

  for (const rawLine of normalized.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph();
      listItems.push(line.slice(2).trim());
      continue;
    }
    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks.length ? blocks : [{ type: "paragraph", text }];
}

function CitationList({
  citations,
  onOpenCitation,
}: {
  citations: Citation[];
  onOpenCitation: (citation: Citation) => void;
}) {
  if (!citations.length) return null;

  return (
    <div className="citation-list">
      {citations.map((citation) => (
        <button
          key={`${citation.file}:${citation.line}:${citation.endLine ?? ""}:${citation.label}`}
          type="button"
          onClick={() => onOpenCitation(citation)}
          aria-label={`Open citation ${citation.label} at ${citationSite(citation)}`}
          title={`${citation.label} - ${citationSite(citation)}`}
        >
          <span className="citation-label">{citation.label}</span>
          <span className="citation-site">{citationSite(citation)}</span>
        </button>
      ))}
    </div>
  );
}

function citationSite(citation: Citation) {
  return citation.endLine && citation.endLine !== citation.line
    ? `${citation.file}:${citation.line}-${citation.endLine}`
    : `${citation.file}:${citation.line}`;
}

export function ProgressNote({
  label,
  detail,
  elapsedSeconds,
}: {
  label: string;
  detail: string;
  elapsedSeconds: number;
}) {
  return (
    <div className="progress-note" role="status">
      <span className="progress-spinner" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <span>
          {detail}
          {elapsedSeconds >= 2 ? ` ${elapsedSeconds}s elapsed.` : ""}
        </span>
      </div>
    </div>
  );
}
