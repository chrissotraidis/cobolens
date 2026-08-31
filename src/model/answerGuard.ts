import type { Citation, RetrievedContext } from "../retrieval/context";

export type CitationGuardContext = Pick<RetrievedContext, "focusNodes" | "citations">;

export type GuardedAnswerText = {
  text: string;
  guarded: boolean;
  repaired?: boolean;
  reason?: string;
};

export function enforceGroundedAnswerCitations(
  text: string,
  context: CitationGuardContext,
  options: { artifactLabel?: string; maxClaims?: number } = {},
): GuardedAnswerText {
  const trimmed = text.trim();
  const normalized = normalizeCitationSyntax(trimmed);
  const reason = citationGuardReason(normalized, context);
  if (!reason) {
    const limited = limitClaims(normalized, options.maxClaims);
    return limited === trimmed
      ? { text: trimmed, guarded: false }
      : {
          text: limited,
          guarded: false,
          repaired: true,
          reason: repairReason(trimmed, normalized, limited),
        };
  }

  const repaired = repairGroundedAnswer(normalized, context, options.maxClaims);
  if (repaired) {
    return {
      text: repaired,
      guarded: false,
      repaired: true,
      reason: `${reason}; removed uncited model claims`,
    };
  }

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

function citationGuardReason(text: string, context: CitationGuardContext) {
  if (!text) return "empty model response";
  if (!hasExactInlineSourceCitation(text)) return "no exact source citations";
  const claims = claimUnits(text);
  if (claims.some((claim) => hasExactInlineSourceCitation(claim) && !hasOnlyAllowedCitations(claim, context))) {
    return "citations outside retrieved context";
  }
  const unsupportedClaim = claims.map((claim) => unsupportedClaimReason(claim, context)).find(Boolean);
  if (unsupportedClaim) return unsupportedClaim;
  if (claims.some((claim) => !hasExactInlineSourceCitation(claim))) return "uncited explanation lines";
  return "";
}

function claimUnits(text: string) {
  return text
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => block.split(/(?<=[.!?])\s+(?=[A-Z])/))
    .map((block) => block.trim())
    .filter(isSubstantiveClaimBlock);
}

function isSubstantiveClaimBlock(block: string) {
  const normalized = block.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim();
  if (normalized.length < 16) return false;
  if (/^#{1,6}\s+/.test(normalized)) return false;
  if (/^[A-Za-z][A-Za-z0-9 /_-]{0,34}:$/.test(normalized)) return false;
  return /[a-z]/i.test(normalized);
}

function repairGroundedAnswer(text: string, context: CitationGuardContext, maxClaims?: number) {
  const allSafeClaims = claimUnits(text)
    .filter((claim) => hasOnlyAllowedCitations(claim, context) && !unsupportedClaimReason(claim, context))
    .map((claim) => `- ${claim.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim()}`);
  const safeClaims = maxClaims ? allSafeClaims.slice(0, maxClaims) : allSafeClaims;
  if (!safeClaims.length) return "";

  const safeText = safeClaims.join("\n");
  const supplementCount = Math.max(0, 6 - safeClaims.length);
  const supplements = graphEvidenceLines(context)
    .filter((line) => !safeText.includes(sourceSiteFromLine(line)))
    .slice(0, supplementCount);

  return [
    ...safeClaims,
    ...(supplements.length ? ["", "Grounded path evidence:", ...supplements] : []),
  ].join("\n");
}

function repairReason(original: string, normalized: string, limited: string) {
  if (original !== normalized && normalized !== limited) return "normalized citations and limited answer length";
  if (original !== normalized) return "normalized citation formatting";
  return "limited answer length";
}

function limitClaims(text: string, maxClaims?: number) {
  if (!maxClaims) return text;
  const claims = claimUnits(text);
  if (claims.length <= maxClaims) return text;
  return claims
    .slice(0, maxClaims)
    .map((claim) => `- ${claim.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim()}`)
    .join("\n");
}

function normalizeCitationSyntax(text: string) {
  const site = String.raw`[\w./-]*\.[A-Za-z][A-Za-z0-9]*:\d+(?:-\d+)?`;
  return text
    .replace(new RegExp(String.raw`\[\[?(${site})\]?\]`, "g"), "($1)")
    .replace(new RegExp(String.raw`\bfile:(${site})`, "g"), "($1)")
    .replace(/\[\d+\]/g, "")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function hasOnlyAllowedCitations(text: string, context: CitationGuardContext) {
  const citations = inlineSourceCitations(text);
  if (!citations.length) return false;
  const allowed = [
    ...context.citations.map((citation) => ({
      file: citation.file,
      startLine: citation.line,
      endLine: citation.endLine ?? citation.line,
    })),
    ...context.focusNodes
      .filter((node) => node.file)
      .map((node) => ({
        file: node.file ?? "",
        startLine: node.lines?.[0] ?? 1,
        endLine: node.lines?.[1] ?? node.lines?.[0] ?? 1,
      })),
  ];
  return citations.every((citation) => allowed.some(
    (range) => range.file === citation.file && citation.startLine >= range.startLine && citation.endLine <= range.endLine,
  ));
}

function unsupportedClaimReason(claim: string, context: CitationGuardContext) {
  const citedLabels = citedEvidenceLabels(claim, context).join(" ");
  const namedArtifacts = namedArtifactTokens(claim);
  const supportedArtifacts = new Set(namedArtifactTokens(citedLabels));
  const unsupportedArtifacts = namedArtifacts.filter((artifact) => !supportedArtifacts.has(artifact));
  if (unsupportedArtifacts.length) {
    return `citation does not support named artifacts: ${unsupportedArtifacts.join(", ")}`;
  }

  const scheduling = claim.match(/\b(?:(?:scheduled?|runs?|executes?)\s+(?:every\s+)?(daily|nightly|weekly|monthly|hourly)|(daily|nightly|weekly|monthly|hourly)\s+(?:schedule|run|job|batch))\b/i);
  if (!scheduling) return "";
  const frequency = (scheduling[1] || scheduling[2]).toLocaleLowerCase();
  const labelSupportsSchedule = new RegExp(`\\b(?:schedule|calendar|trigger|cron|every)\\w*\\b[^.]*\\b${frequency}\\b|\\b${frequency}\\b[^.]*\\b(?:schedule|calendar|trigger|cron|every)\\w*\\b`, "i").test(citedLabels);
  return labelSupportsSchedule ? "" : "unsupported scheduling claim";
}

const ARTIFACT_TOKEN_EXCLUSIONS = new Set(["AI", "API", "COBOL", "CICS", "DB2", "DD", "JCL", "SQL"]);

function namedArtifactTokens(text: string) {
  const withoutCitations = text.replace(/[\w./-]*\.[A-Za-z][A-Za-z0-9]*:\d+(?:-\d+)?/g, "");
  return [...new Set(withoutCitations.match(/\b(?:[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)+|[A-Z][A-Z0-9]{2,})\b/g) ?? [])]
    .filter((token) => !ARTIFACT_TOKEN_EXCLUSIONS.has(token));
}

function citedEvidenceLabels(text: string, context: CitationGuardContext) {
  return inlineSourceCitations(text).flatMap((inline) => context.citations
    .filter((citation) => {
      const endLine = citation.endLine ?? citation.line;
      return citation.file === inline.file && inline.startLine <= endLine && inline.endLine >= citation.line;
    })
    .map((citation) => citation.label));
}

function inlineSourceCitations(text: string) {
  const citations: Array<{ file: string; startLine: number; endLine: number }> = [];
  const pattern = /([\w./-]*\.[A-Za-z][A-Za-z0-9]*):(\d+)(?:-(\d+))?/g;
  for (const match of text.matchAll(pattern)) {
    citations.push({
      file: match[1],
      startLine: Number(match[2]),
      endLine: Number(match[3] ?? match[2]),
    });
  }
  return citations;
}

function graphEvidenceLines(context: CitationGuardContext) {
  const seen = new Set<string>();
  return context.citations.flatMap((citation) => {
    const site = formatSite(citation);
    if (seen.has(site)) return [];
    seen.add(site);
    return [`- ${citation.label} (${site}).`];
  });
}

function sourceSiteFromLine(line: string) {
  return inlineSourceCitations(line)[0]
    ? line.match(/[\w./-]*\.[A-Za-z][A-Za-z0-9]*:\d+(?:-\d+)?/)?.[0] ?? ""
    : "";
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
