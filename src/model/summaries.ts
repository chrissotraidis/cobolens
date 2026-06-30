import { generateText } from "ai";
import type { GraphDocument, GraphNode, SourceExcerpt } from "../lib/graph";
import type { ModelSettings } from "./config";
import { createLanguageModel } from "./providers";

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
    model: createLanguageModel(settings, apiKey),
    system: summarySystemPrompt(settings.rosettaLanguage),
    prompt: summaryUserPrompt(graph, node, excerpt),
    temperature: 0.1,
    maxOutputTokens: 420,
  });

  return {
    nodeId: node.id,
    text: result.text.trim(),
    provider: settings.provider,
    model: settings.model,
  };
}

function summarySystemPrompt(rosettaLanguage: string) {
  return [
    "You explain a COBOL codebase to an engineer who may not know COBOL.",
    "Use only the provided graph facts and source excerpt.",
    "Treat unit and symbol names as codebase artifacts, not as generic computing terms.",
    "Do not infer business purpose, business rules, or technical meaning from names alone.",
    "Cite file:line for every concrete claim.",
    "If the excerpt is insufficient, say what is missing.",
    `When the source shows a COBOL construct, you may translate that construct into ${rosettaLanguage} terms.`,
  ].join(" ");
}

function summaryUserPrompt(graph: GraphDocument, node: GraphNode, excerpt: SourceExcerpt) {
  return [
    "Summarize this unit in 2-4 direct sentences.",
    "Start with what the graph proves about this unit: type, source location, and cited relationships.",
    "When Graph facts list relationships, mention at least one relationship with its exact file:line citation.",
    "Include inputs, outputs, calls, datasets, tables, or visible rules only when present in the graph facts or source excerpt.",
    "Do not include a preamble such as 'Here is a summary'.",
    "Do not invent dependencies, business purpose, or business rules.",
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
