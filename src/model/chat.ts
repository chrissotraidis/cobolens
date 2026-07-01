import { generateText } from "ai";
import type { RetrievedContext } from "../retrieval/context";
import { enforceGroundedAnswerCitations } from "./answerGuard";
import type { ModelSettings } from "./config";
import { createLanguageModel } from "./providers";
import { groundedAnswerSystemPrompt } from "./prompts";

const LOCAL_ASK_MAX_OUTPUT_TOKENS = 260;
const CLOUD_ASK_MAX_OUTPUT_TOKENS = 520;

export type GroundedAnswer = {
  text: string;
  guarded?: boolean;
  guardReason?: string;
};

export async function generateGroundedAnswer({
  question,
  context,
  settings,
  apiKey,
  abortSignal,
}: {
  question: string;
  context: RetrievedContext;
  settings: ModelSettings;
  apiKey?: string;
  abortSignal?: AbortSignal;
}): Promise<GroundedAnswer> {
  const result = await generateText({
    model: createLanguageModel(settings, apiKey),
    system: groundedAnswerSystemPrompt(settings.rosettaLanguage),
    prompt: [
      context.prompt,
      "",
      "Answer the user's question with a concise explanation and inline citations.",
      answerLengthInstruction(settings),
      "Write citations exactly as file:line or file:start-end in parentheses, for example (src/LINEAGE.cbl:21).",
      "Do not use [1], [2], or any other footnote-style citations.",
      "Do not include a claim unless you can cite it from the context.",
      "If context is thin, say what is known and what is not shown.",
      `User question: ${question}`,
    ].join("\n"),
    temperature: 0.1,
    maxOutputTokens: askMaxOutputTokens(settings),
    abortSignal,
  });

  const guarded = enforceGroundedAnswerCitations(result.text, context);
  return { text: guarded.text, guarded: guarded.guarded, guardReason: guarded.reason };
}

export function askMaxOutputTokens(settings: Pick<ModelSettings, "provider">) {
  return settings.provider === "ollama" ? LOCAL_ASK_MAX_OUTPUT_TOKENS : CLOUD_ASK_MAX_OUTPUT_TOKENS;
}

function answerLengthInstruction(settings: Pick<ModelSettings, "provider">) {
  if (settings.provider === "ollama") {
    return "Use 1-3 short bullets or sentences; keep local Ollama answers brief so they return quickly.";
  }
  return "Use 2-4 short bullets or sentences unless the question asks for more detail.";
}
