export function assertLocalOllamaUrl(baseUrl: string) {
  const parsed = new URL(baseUrl || "http://127.0.0.1:11434/api");
  const host = parsed.hostname.toLocaleLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "[::1]") {
    throw new Error("Local mode only permits Ollama on localhost.");
  }
}

export function normalizeOllamaBaseUrl(baseUrl: string) {
  const trimmed = (baseUrl || "http://127.0.0.1:11434/api").replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}
