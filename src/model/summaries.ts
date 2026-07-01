import { generateText } from "ai";
import type { GraphDocument, GraphNode, SourceExcerpt } from "../lib/graph";
import type { Citation } from "../retrieval/context";
import { enforceGroundedAnswerCitations, type GuardedAnswerText } from "./answerGuard";
import type { ModelSettings } from "./config";
import { createLanguageModel } from "./providers";

const LOCAL_SUMMARY_MAX_OUTPUT_TOKENS = 260;
const CLOUD_SUMMARY_MAX_OUTPUT_TOKENS = 420;

export type UnitSummary = {
  nodeId: string;
  text: string;
  provider: string;
  model: string;
  guarded?: boolean;
  guardReason?: string;
};

export async function generateUnitSummary({
  graph,
  node,
  excerpt,
  settings,
  apiKey,
  abortSignal,
}: {
  graph: GraphDocument;
  node: GraphNode;
  excerpt: SourceExcerpt;
  settings: ModelSettings;
  apiKey?: string;
  abortSignal?: AbortSignal;
}): Promise<UnitSummary> {
  const result = await generateText({
    model: createLanguageModel(settings, apiKey),
    system: summarySystemPrompt(settings.rosettaLanguage),
    prompt: summaryUserPrompt(graph, node, excerpt, settings),
    temperature: 0.1,
    maxOutputTokens: summaryMaxOutputTokens(settings),
    abortSignal,
  });

  const guarded = guardUnitSummaryText({
    graph,
    node,
    excerpt,
    text: result.text,
  });

  return {
    nodeId: node.id,
    text: guarded.text,
    provider: settings.provider,
    model: settings.model,
    guarded: guarded.guarded,
    guardReason: guarded.reason,
  };
}

export function guardUnitSummaryText({
  graph,
  node,
  excerpt,
  text,
}: {
  graph: GraphDocument;
  node: GraphNode;
  excerpt: SourceExcerpt;
  text: string;
}): GuardedAnswerText {
  return enforceGroundedAnswerCitations(
    text,
    {
      focusNodes: [node],
      citations: summaryGuardCitations(graph, node, excerpt),
    },
    { artifactLabel: "model summary" },
  );
}

export function summaryMaxOutputTokens(settings: Pick<ModelSettings, "provider">) {
  return settings.provider === "ollama" ? LOCAL_SUMMARY_MAX_OUTPUT_TOKENS : CLOUD_SUMMARY_MAX_OUTPUT_TOKENS;
}

function summarySystemPrompt(rosettaLanguage: string) {
  return [
    "You explain a COBOL codebase to an engineer who may not know COBOL.",
    "Use only the provided graph facts and source excerpt.",
    "Treat unit and symbol names as codebase artifacts, not as generic computing terms.",
    "Do not infer business purpose, business rules, or technical meaning from names alone.",
    "Cite file:line or file:start-end for every concrete claim.",
    "Citation format must be exact inline text such as (src/LINEAGE.cbl:21); never use bracketed footnotes like [1].",
    "If the excerpt is insufficient, say what is missing.",
    `When the source shows a COBOL construct, you may translate that construct into ${rosettaLanguage} terms.`,
  ].join(" ");
}

function summaryLengthInstruction(settings: Pick<ModelSettings, "provider">) {
  if (settings.provider === "ollama") {
    return "Summarize this unit in 1-2 short cited bullets or sentences; keep local Ollama summaries brief so they return quickly.";
  }
  return "Summarize this unit in 2-4 direct sentences.";
}

function summaryUserPrompt(
  graph: GraphDocument,
  node: GraphNode,
  excerpt: SourceExcerpt,
  settings: Pick<ModelSettings, "provider">,
) {
  return [
    summaryLengthInstruction(settings),
    "End every bullet or sentence with an exact inline source citation from the graph facts or source excerpt.",
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

function summaryGuardCitations(graph: GraphDocument, node: GraphNode, excerpt: SourceExcerpt): Citation[] {
  return dedupeCitations([
    ...(node.file
      ? [{
          file: node.file,
          line: node.lines?.[0] ?? excerpt.startLine,
          endLine: node.lines?.[1] ?? excerpt.endLine,
          label: `${node.name} source`,
          nodeId: node.id,
        }]
      : []),
    ...graph.edges
      .filter((edge) => (edge.from === node.id || edge.to === node.id) && edge.site)
      .slice(0, 8)
      .map((edge) => ({
        file: edge.site?.file ?? "",
        line: edge.site?.line ?? 1,
        label: graphEdgeLabel(graph, edge),
        nodeId: edge.from,
      })),
  ]).filter((citation) => citation.file);
}

function graphEdgeLabel(graph: GraphDocument, edge: { from: string; to: string; type: string }) {
  const from = graph.nodes.find((candidate) => candidate.id === edge.from)?.name ?? edge.from;
  const to = graph.nodes.find((candidate) => candidate.id === edge.to)?.name ?? edge.to;
  return `${from} ${edge.type} ${to}`;
}

function dedupeCitations(citations: Citation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.file}:${citation.line}:${citation.endLine ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
