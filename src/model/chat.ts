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
      "Answer the user's question with a concise explanation and inline citations.",
      "Use 2-4 short bullets or sentences unless the question asks for more detail.",
      "Write citations exactly as file:line or file:start-end in parentheses, for example (src/LINEAGE.cbl:21).",
      "Do not use [1], [2], or any other footnote-style citations.",
      "Do not include a claim unless you can cite it from the context.",
      "If context is thin, say what is known and what is not shown.",
      `User question: ${question}`,
    ].join("\n"),
    temperature: 0.1,
    maxOutputTokens: 520,
    abortSignal,
  });

  return { text: result.text.trim() };
}
