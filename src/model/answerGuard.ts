import type { Citation, RetrievedContext } from "../retrieval/context";

export type CitationGuardContext = Pick<RetrievedContext, "focusNodes" | "citations">;

export type GuardedAnswerText = {
  text: string;
  guarded: boolean;
  reason?: string;
};

export function enforceGroundedAnswerCitations(
  text: string,
  context: CitationGuardContext,
  options: { artifactLabel?: string } = {},
): GuardedAnswerText {
  const trimmed = text.trim();
  const reason = citationGuardReason(trimmed);
  if (!reason) return { text: trimmed, guarded: false };

  return {
    text: groundedCitationFallback(context, reason, options.artifactLabel ?? "model answer"),
    guarded: true,
    reason,
  };
}

export function hasExactInlineSourceCitation(text: string) {
  // Accept a source citation as a path with a letter-led file extension and a
  // line (or range), whether or not it is wrapped in parentheses. Small local
  // models reliably cite as "at src/LINEAGE.cbl:21" rather than
  // "(src/LINEAGE.cbl:21)"; both point at the same auditable line, and the
  // clickable evidence chips come from the retrieved context, not from parsing
  // this text. Requiring a letter-led extension avoids matching bare ratios or
  // times such as "1.18:1".
  return /[\w./-]*\.[A-Za-z][A-Za-z0-9]*:\d+(?:-\d+)?/.test(text);
}

function citationGuardReason(text: string) {
  if (!text) return "empty model response";
  if (/\[\d+\]/.test(text)) return "footnote-style citations";
  if (!hasExactInlineSourceCitation(text)) return "no exact source citations";
  if (!citedClaimsOutnumberUncited(text)) return "uncited explanation lines";
  return "";
}

// Require the grounded claims to outnumber uncited ones rather than demanding a
// citation on every line. This tolerates a single framing or summary sentence
// (which small models reliably add) while still rejecting mostly-uncited prose.
function citedClaimsOutnumberUncited(text: string) {
  const claimBlocks = text
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter(isSubstantiveClaimBlock);
  if (!claimBlocks.length) return true;
  let cited = 0;
  let uncited = 0;
  for (const block of claimBlocks) {
    if (hasExactInlineSourceCitation(block)) cited += 1;
    else uncited += 1;
  }
  return cited > uncited;
}

function isSubstantiveClaimBlock(block: string) {
  const normalized = block.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim();
  if (normalized.length < 16) return false;
  if (/^#{1,6}\s+/.test(normalized)) return false;
  if (/^[A-Za-z][A-Za-z0-9 /_-]{0,34}:$/.test(normalized)) return false;
  return /[a-z]/i.test(normalized);
}

function groundedCitationFallback(context: CitationGuardContext, reason: string, artifactLabel: string) {
  const focus = context.focusNodes
    .filter((node) => node.file)
    .slice(0, 3)
    .map((node) => {
      const line = node.lines?.[0] ?? 1;
      const endLine = node.lines?.[1];
      return `- ${node.name} is a ${node.type} (${formatSite({ file: node.file ?? "", line, endLine })}).`;
    });
  const evidence = context.citations.slice(0, 8).map((citation) => `- ${citation.label} (${formatSite(citation)}).`);

  return [
    `Local AI draft failed citation checks, so Cobolens used the graph answer.`,
    `Details: ${artifactLabel} had ${reason}.`,
    "",
    "What the graph can show:",
    ...(focus.length ? focus : ["- No source-backed matched symbol was available in the retrieved context."]),
    "",
    "Evidence:",
    ...(evidence.length
      ? evidence
      : ["- No exact source citations were available. Select a source-backed symbol or use a graph shortcut."]),
  ].join("\n");
}

function formatSite(citation: Pick<Citation, "file" | "line" | "endLine">) {
  const range = citation.endLine && citation.endLine !== citation.line ? `${citation.line}-${citation.endLine}` : String(citation.line);
  return `${citation.file}:${range}`;
}
