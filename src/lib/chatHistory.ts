import type { ChatMessage } from "../types";

export function getRecentQuestionHistory(
  messages: ChatMessage[],
  questionLimit: number,
): ChatMessage[] {
  if (questionLimit <= 0 || messages.length === 0) return [];

  let questionsFound = 0;
  let startIndex = messages.length;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role !== "user") continue;
    questionsFound += 1;
    startIndex = index;
    if (questionsFound >= questionLimit) break;
  }
  return messages.slice(startIndex);
}
