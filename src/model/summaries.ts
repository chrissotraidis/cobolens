import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, type LanguageModel } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import type { GraphDocument, GraphNode, SourceExcerpt } from "../lib/graph";
import type { ModelSettings } from "./config";

export type UnitSummary = {
  nodeId: string;
  text: string;
  provider: string;
  model: string;
};

export async function generateUnitSummary({
  graph,
  node,
  excerpt,
  settings,
  apiKey,
}: {
  graph: GraphDocument;
  node: GraphNode;
  excerpt: SourceExcerpt;
  settings: ModelSettings;
  apiKey?: string;
}): Promise<UnitSummary> {
  const result = await generateText({
    model: languageModel(settings, apiKey),
    system: summarySystemPrompt(settings.rosettaLanguage),
    prompt: summaryUserPrompt(graph, node, excerpt),
    temperature: 0.2,
    maxOutputTokens: 420,
  });

  return {
    nodeId: node.id,
    text: result.text.trim(),
    provider: settings.provider,
    model: settings.model,
  };
}

function languageModel(settings: ModelSettings, apiKey?: string): LanguageModel {
  if (settings.provider === "ollama") {
    const ollama = createOllama({ baseURL: normalizeOllamaBaseUrl(settings.baseUrl) });
    return ollama.completion(settings.model);
  }

  if (!apiKey) {
    throw new Error(`${settings.provider} API key is not configured.`);
  }

  if (settings.provider === "anthropic") {
    return createAnthropic({ apiKey })(settings.model);
  }

  if (settings.provider === "openai") {
    return createOpenAI({ apiKey })(settings.model);
  }

  return createOpenRouter({ apiKey })(settings.model);
}

function summarySystemPrompt(rosettaLanguage: string) {
  return [
    "You explain a COBOL codebase to an engineer who may not know COBOL.",
    "Use only the provided graph facts and source excerpt.",
    "Cite file:line for every concrete claim.",
    "If the excerpt is insufficient, say what is missing.",
    `When useful, translate COBOL constructs into ${rosettaLanguage} terms.`,
  ].join(" ");
}

function summaryUserPrompt(graph: GraphDocument, node: GraphNode, excerpt: SourceExcerpt) {
  return [
    "Summarize this unit in 2-4 sentences.",
    "Include purpose, important inputs/outputs, and any visible business rules.",
    "Keep it grounded; do not invent dependencies.",
    "",
    `Unit: ${node.name}`,
    `Type: ${node.type}`,
    `Location: ${node.file ?? "external"}:${node.lines?.[0] ?? excerpt.startLine}-${node.lines?.[1] ?? excerpt.endLine}`,
    "",
    "Graph facts:",
    graphFacts(graph, node),
    "",
    `Source excerpt${excerpt.truncated ? " (truncated)" : ""}:`,
    excerpt.text,
  ].join("\n");
}

function graphFacts(graph: GraphDocument, node: GraphNode) {
  const related = graph.edges
    .filter((edge) => edge.from === node.id || edge.to === node.id)
    .slice(0, 24)
    .map((edge) => {
      const from = graph.nodes.find((candidate) => candidate.id === edge.from)?.name ?? edge.from;
      const to = graph.nodes.find((candidate) => candidate.id === edge.to)?.name ?? edge.to;
      const site = edge.site ? ` at ${edge.site.file}:${edge.site.line}` : "";
      return `- ${from} ${edge.type} ${to}${site}`;
    });

  return related.length ? related.join("\n") : "- No direct graph relationships recorded.";
}

function normalizeOllamaBaseUrl(baseUrl: string) {
  const trimmed = (baseUrl || "http://127.0.0.1:11434/api").replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}
