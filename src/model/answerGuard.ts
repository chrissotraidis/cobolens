import type { Citation, RetrievedContext } from "../retrieval/context";

export type GuardedAnswerText = {
  text: string;
  guarded: boolean;
  reason?: string;
};

export function enforceGroundedAnswerCitations(text: string, context: RetrievedContext): GuardedAnswerText {
  const trimmed = text.trim();
  const reason = citationGuardReason(trimmed);
  if (!reason) return { text: trimmed, guarded: false };

  return {
    text: groundedCitationFallback(context, reason),
    guarded: true,
    reason,
  };
}

export function hasExactInlineSourceCitation(text: string) {
  return /\([^()\n\r]+:\d+(?:-\d+)?\)/.test(text);
}

function citationGuardReason(text: string) {
  if (!text) return "empty model response";
  if (/\[\d+\]/.test(text)) return "footnote-style citations";
  if (!hasExactInlineSourceCitation(text)) return "no exact source citations";
  if (!allSubstantiveBlocksHaveCitations(text)) return "uncited explanation lines";
  return "";
}

function allSubstantiveBlocksHaveCitations(text: string) {
  return text
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .every((block) => !isSubstantiveClaimBlock(block) || hasExactInlineSourceCitation(block));
}

function isSubstantiveClaimBlock(block: string) {
  const normalized = block.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim();
  if (normalized.length < 16) return false;
  if (/^#{1,6}\s+/.test(normalized)) return false;
  if (/^[A-Za-z][A-Za-z0-9 /_-]{0,34}:$/.test(normalized)) return false;
  return /[a-z]/i.test(normalized);
}

function groundedCitationFallback(context: RetrievedContext, reason: string) {
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
    `Cobolens replaced the model answer because it had ${reason}.`,
    "",
    "Grounded context available:",
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
