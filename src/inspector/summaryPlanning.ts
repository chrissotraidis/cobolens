import { estimateTokens } from "../export/docs";
import type { GraphDocument, GraphNode } from "../lib/graph";
import { isSummaryUnit } from "../lib/graphSelectors";

const BULK_SUMMARY_CONTEXT_ALLOWANCE_TOKENS = 900;

export function summaryGenerationNodes(graph: GraphDocument | null) {
  return graph?.nodes.filter((node) => isSummaryUnit(node) && !node.external && node.file) ?? [];
}

export function estimateBulkSummaryTokens(nodes: GraphNode[]) {
  return nodes.reduce(
    (total, node) => total + estimateTokens(`${node.name} ${node.file ?? ""} ${node.lines?.join("-") ?? ""}`) + BULK_SUMMARY_CONTEXT_ALLOWANCE_TOKENS,
    0,
  );
}
