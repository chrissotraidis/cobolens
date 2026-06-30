import { generateText } from "ai";
import type { RetrievedContext } from "../retrieval/context";
import type { ModelSettings } from "./config";
import { createLanguageModel } from "./providers";
import { groundedAnswerSystemPrompt } from "./prompts";

export type GroundedAnswer = {
  text: string;
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
      "Answer the user's question with a concise explanation and citations.",
      `User question: ${question}`,
    ].join("\n"),
    temperature: 0.1,
    maxOutputTokens: 520,
    abortSignal,
  });

  return { text: result.text.trim() };
}
