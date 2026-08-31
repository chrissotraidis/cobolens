const COMPLETE_QUESTION_MESSAGE = 'Write a complete question, like "What does this program do?"';

const QUESTION_FILLER_WORDS = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "it",
  "its",
  "does",
  "do",
  "is",
  "are",
]);

export function inputQualityMessage(question: string, hasSelectedNode = false) {
  const trimmed = question.trim();
  const words = trimmed
    .toLocaleLowerCase()
    .split(/[^a-z0-9_-]+/i)
    .filter(Boolean);
  const meaningfulWords = words.filter((word) => !QUESTION_FILLER_WORDS.has(word));
  const usesSelectedContext = /\b(this|that|it|its|selected|current)\b/i.test(trimmed);
  const hasQuestionIntent = /\b(what|who|where|when|why|how|explain|show|trace|walk|read|write|call|flow)\b/i.test(trimmed);

  if (trimmed.length < 8) return COMPLETE_QUESTION_MESSAGE;
  if (hasSelectedNode && usesSelectedContext && hasQuestionIntent) return "";
  if (meaningfulWords.length < 2) return COMPLETE_QUESTION_MESSAGE;
  return "";
}
