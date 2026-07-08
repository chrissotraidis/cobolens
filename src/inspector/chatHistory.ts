type RecentChatAnswer = {
  question: string;
  text: string;
};

export const CHAT_HISTORY_LIMIT = 6;

export function rememberRecentChatAnswer<T extends RecentChatAnswer>(current: T[], answer: T) {
  return [
    answer,
    ...current.filter((item) => item.question !== answer.question || item.text !== answer.text),
  ].slice(0, CHAT_HISTORY_LIMIT);
}
