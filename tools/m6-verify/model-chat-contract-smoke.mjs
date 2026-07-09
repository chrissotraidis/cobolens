#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const chatSource = await readFile(resolve(repoRoot, "src", "model", "chat.ts"), "utf8");
const runtimeSource = await readFile(resolve(repoRoot, "src", "model", "modelRuntime.ts"), "utf8");
const askGenerationSource = await readFile(resolve(repoRoot, "src", "inspector", "useAskGeneration.ts"), "utf8");
const chatPanelSource = await readFile(resolve(repoRoot, "src", "inspector", "ChatAnswerPanel.tsx"), "utf8");
const aiProgressSource = await readFile(resolve(repoRoot, "src", "inspector", "aiProgress.ts"), "utf8");

const checks = {
  "Ask streams model text": chatSource.includes('import { streamText } from "ai"') &&
    chatSource.includes("for await (const delta of result.textStream)") &&
    !chatSource.includes('import { generateText } from "ai"'),
  "Ask exposes streaming callbacks": chatSource.includes("onFirstToken?: () => void") &&
    chatSource.includes("onTextDelta?: (text: string) => void") &&
    chatSource.includes("onTextDelta?.(text)"),
  "Ask uses first-token timeout instead of whole-call timeout": runtimeSource.includes("const FIRST_TOKEN_TIMEOUT_MS = 30_000") &&
    runtimeSource.includes("export async function runStreamingModelCall") &&
    runtimeSource.includes("timedOutBeforeFirstToken") &&
    runtimeSource.includes("did not receive any model text within ${seconds}s"),
  "Ask generation hook streams drafts through the chat answer": askGenerationSource.includes('runStreamingModelCall("Ask"') &&
    askGenerationSource.includes("onFirstToken: noteFirstToken") &&
    askGenerationSource.includes("onTextDelta: (draft) => {") &&
    !askGenerationSource.includes('runTimedModelCall("Ask"'),
  "Chat panel renders streamed Ask in the plain chat surface": chatPanelSource.includes('className="chat-answer-bubble"') &&
    chatPanelSource.includes('className="chat-answer-text"') &&
    chatPanelSource.includes('className="chat-stream-stages"') &&
    aiProgressSource.includes("Final citations are checked before the answer is trusted."),
  "local Ask budget is smaller than cloud budget":
    chatSource.includes("const LOCAL_ASK_MAX_OUTPUT_TOKENS = 512") &&
    chatSource.includes("const CLOUD_ASK_MAX_OUTPUT_TOKENS = 520"),
  "Ask generation uses provider-aware budget": chatSource.includes("maxOutputTokens: askMaxOutputTokens(settings)"),
  "Ollama prompt asks for brief answers": chatSource.includes("Use 1-3 short bullets; keep local Ollama answers brief so they return quickly"),
  "Ask prompt requires citation-ended units": chatSource.includes("End every bullet or sentence with an exact inline source citation from the context."),
  "cloud prompt keeps fuller answer allowance": chatSource.includes("Use 2-4 short bullets or sentences unless the question asks for more detail."),
  "Ask still guards final stream text": chatSource.includes("enforceGroundedAnswerCitations(text, context)"),
  "budget helper is exported for future behavioral tests": chatSource.includes("export function askMaxOutputTokens"),
};

const failed = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

if (failed.length) {
  console.error(`Model chat contract smoke failed: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(JSON.stringify({ checks }, null, 2));
