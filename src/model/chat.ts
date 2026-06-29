import { generateText } from "ai";
import type { RetrievedContext } from "../retrieval/context";
import type { ModelSettings } from "./config";
import { createLanguageModel } from "./providers";

export type GroundedAnswer = {
  text: string;
};

export async function generateGroundedAnswer({
  question,
  context,
  settings,
  apiKey,
}: {
  question: string;
  context: RetrievedContext;
  settings: ModelSettings;
  apiKey?: string;
}): Promise<GroundedAnswer> {
  const result = await generateText({
    model: createLanguageModel(settings, apiKey),
    system: [
      "You answer questions about a COBOL codebase for an engineer who may not know COBOL.",
      "Use only the provided graph relationships and source excerpts.",
      "Cite file:line for every concrete claim.",
      "If the context does not answer the question, say so plainly.",
      "Never invent files, nodes, edges, jobs, datasets, or line numbers.",
    ].join(" "),
    prompt: [
      context.prompt,
      "",
      "Answer the user's question with a concise explanation and citations.",
      `User question: ${question}`,
    ].join("\n"),
    temperature: 0.1,
    maxOutputTokens: 520,
  });

  return { text: result.text.trim() };
}
