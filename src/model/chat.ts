import { streamText } from "ai";
import type { RetrievedContext } from "../retrieval/context";
import { enforceGroundedAnswerCitations } from "./answerGuard";
import type { ModelSettings } from "./config";
import { createLanguageModel } from "./providers";
import { groundedAnswerSystemPrompt } from "./prompts";

// Local stays below cloud to keep CPU answers quick, but needs headroom for
// thinking-capable local models whose reasoning counts against the budget.
const LOCAL_ASK_MAX_OUTPUT_TOKENS = 720;
const CLOUD_ASK_MAX_OUTPUT_TOKENS = 520;

export type GroundedAnswer = {
  text: string;
  guarded?: boolean;
  repaired?: boolean;
  retried?: boolean;
  guardReason?: string;
};

export async function generateGroundedAnswer({
  question,
  context,
  settings,
  apiKey,
  abortSignal,
  onFirstToken,
  onTextDelta,
}: {
  question: string;
  context: RetrievedContext;
  settings: ModelSettings;
  apiKey?: string;
  abortSignal?: AbortSignal;
  onFirstToken?: () => void;
  onTextDelta?: (text: string) => void;
}): Promise<GroundedAnswer> {
  const allowedEvidence = context.citations
    .slice(0, 18)
    .map((citation) => `- ${formatCitation(citation)}: ${citation.label}`)
    .join("\n");
  const model = createLanguageModel(settings, apiKey);
  let sawFirstToken = false;
  const streamDraft = async (prompt: string) => {
    const result = streamText({
      model,
      system: groundedAnswerSystemPrompt(settings.rosettaLanguage),
      prompt,
      temperature: 0.1,
      maxOutputTokens: askMaxOutputTokens(settings),
      abortSignal,
    });

    let draft = "";
    for await (const delta of result.textStream) {
      if (!sawFirstToken) {
        sawFirstToken = true;
        onFirstToken?.();
      }
      draft += delta;
      onTextDelta?.(draft);
    }
    return draft;
  };
  const answerPrompt = [
      context.prompt,
      "",
      "Answer the user's actual question with concise cited bullets.",
      answerLengthInstruction(settings),
      "Synthesize across the planned graph paths and source excerpts; do not merely list matched artifacts.",
      "For a data-flow question, order the answer from input through transformations to output and name where business data is added.",
      "Use the Key evidence section as the answer outline. Cover every part of the question before adding secondary details.",
      "When one bullet names several artifacts, cite each relationship line that supports those artifact names.",
      "Do not write an introduction, heading, conclusion, or citation list.",
      "Allowed evidence and citations:",
      allowedEvidence || "- none",
      "Use only facts from that evidence and the source excerpts above.",
      "Copy citations only from the allowed evidence, exactly as shown.",
      "End every bullet with exactly one allowed citation in parentheses.",
      "Keep one factual claim per bullet.",
      "Do not use [1], [2], or any other footnote-style citations.",
      "Do not include a claim unless you can cite it from the context.",
      "Do not infer a schedule or run frequency from artifact names such as DAILYLN or datasets containing DAILY.",
      "If context is thin, say what is known and what is not shown.",
      `User question: ${question}`,
    ].join("\n");

  let text = await streamDraft(answerPrompt);
  let guarded = enforceGroundedAnswerCitations(text, context, {
    maxClaims: 4,
  });
  let retried = false;
  if (settings.provider === "ollama" && guarded.guarded && !abortSignal?.aborted) {
    retried = true;
    onTextDelta?.("");
    text = await streamDraft([
      context.prompt,
      "",
      "The first draft could not be used because it lacked an allowed exact citation.",
      "Return one to four bullet lines and nothing else.",
      "Restate only the evidence below in plain language.",
      "Allowed evidence and citations:",
      allowedEvidence || "- none",
      "Use one evidence item per bullet and copy its citation exactly in parentheses at the end.",
      `User question: ${question}`,
    ].join("\n"));
    guarded = enforceGroundedAnswerCitations(text, context, { maxClaims: 4 });
  }
  return {
    text: guarded.text,
    guarded: guarded.guarded,
    repaired: guarded.repaired,
    retried,
    guardReason: guarded.reason,
  };
}

export function askMaxOutputTokens(settings: Pick<ModelSettings, "provider">) {
  return settings.provider === "ollama" ? LOCAL_ASK_MAX_OUTPUT_TOKENS : CLOUD_ASK_MAX_OUTPUT_TOKENS;
}

function answerLengthInstruction(settings: Pick<ModelSettings, "provider">) {
  if (settings.provider === "ollama") {
    return "Use 2-4 short bullets; keep local Ollama answers brief but preserve the important path through the code.";
  }
  return "Use 2-4 short bullets or sentences unless the question asks for more detail.";
}

function formatCitation(citation: RetrievedContext["citations"][number]) {
  const range = citation.endLine && citation.endLine !== citation.line
    ? `${citation.line}-${citation.endLine}`
    : String(citation.line);
  return `${citation.file}:${range}`;
}
