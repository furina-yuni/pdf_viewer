import { describe, expect, it } from "vitest";
import { getRecentQuestionHistory } from "./chatHistory";
import type { ChatMessage } from "../types";

const messages: ChatMessage[] = [
  { id: "u1", role: "user", content: "질문 1" },
  { id: "a1", role: "assistant", content: "답변 1" },
  { id: "u2", role: "user", content: "질문 2" },
  { id: "a2", role: "assistant", content: "답변 2" },
  { id: "u3", role: "user", content: "질문 3" },
  { id: "a3", role: "assistant", content: "답변 3" },
];

describe("recent question history", () => {
  it("keeps complete user/assistant turns for the requested number of questions", () => {
    expect(getRecentQuestionHistory(messages, 2).map((message) => message.id))
      .toEqual(["u2", "a2", "u3", "a3"]);
  });

  it("can disable previous conversation context", () => {
    expect(getRecentQuestionHistory(messages, 0)).toEqual([]);
  });
});
