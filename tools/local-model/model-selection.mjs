const DEFAULT_FALLBACK_MODEL = "llama3.2:1b";

export function selectReadinessModel({ explicitModel = "", listOutput = "" } = {}) {
  const requested = explicitModel.trim();
  if (requested) return requested;

  const installed = parseInstalledModels(listOutput);
  return installed.find((model) => !looksLikeEmbeddingModel(model)) ?? installed[0] ?? DEFAULT_FALLBACK_MODEL;
}

export function parseInstalledModels(listOutput) {
  return listOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^NAME\s+/i.test(line))
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean);
}

function looksLikeEmbeddingModel(model) {
  return /(?:^|[-_:])(embed|embedding|nomic|mxbai|bge|all-minilm|snowflake)(?:[-_:]|$)/i.test(model);
}
