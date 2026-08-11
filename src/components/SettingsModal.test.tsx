import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backendFetch } from "../lib/backend";
import { SettingsModal } from "./SettingsModal";

vi.mock("../lib/backend", () => ({
  backendFetch: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsModal", () => {
  it("shows resumable PDF indexing progress in API settings", async () => {
    vi.mocked(backendFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        provider: "gemini",
        model: "gemini-3.6-flash",
        base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        has_api_key: true,
        rag_enabled: true,
        embedding_model: "gemini-embedding-2",
      }),
    } as Response);

    render(
      <SettingsModal
        open
        historyQuestionLimit={10}
        totalPages={343}
        ragIndexing={false}
        ragStatus={{
          state: "error",
          indexed_pages: 56,
          processed_pages: Array.from({ length: 56 }, (_, index) => index + 1),
          total_pages: 343,
          provider: "gemini",
          embedding_model: "gemini-embedding-2",
          rag_enabled: true,
          error: "429 Too Many Requests",
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onRagSettingsChanged={vi.fn()}
        onStartRag={vi.fn()}
        onReindexRag={vi.fn()}
        onHistoryQuestionLimit={vi.fn()}
      />,
    );

    expect(await screen.findByText("56/343페이지 · 16%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "문서 색인 진행률" })).toHaveAttribute(
      "aria-valuenow",
      "56",
    );
    expect(screen.getByRole("button", { name: "이어서 색인" })).toBeEnabled();
  });
});
