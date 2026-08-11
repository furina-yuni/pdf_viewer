import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatSidebar } from "./ChatSidebar";

describe("ChatSidebar", () => {
  it("shows selected PDF text as a removable attachment", () => {
    const removeSelection = vi.fn();
    render(
      <ChatSidebar
        messages={[]}
        totalPages={3}
        selectedTexts={[
          { id: "first", text: "드래그해서 선택한 중요한 문장" },
          { id: "second", text: "두 번째 인용문" },
        ]}
        busy={false}
        question=""
        onQuestion={vi.fn()}
        onRemoveSelection={removeSelection}
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
        onPageClick={vi.fn()}
      />,
    );

    expect(screen.getByText("드래그해서 선택한 중요한 문장")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "질문 전송" })).toBeInTheDocument();
    expect(screen.queryByText("전송")).not.toBeInTheDocument();
    expect(screen.getByText("두 번째 인용문")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "인용 1 제거" }));
    expect(removeSelection).toHaveBeenCalledWith("first");
  });

  it("renders inline and block LaTeX as formatted math", () => {
    const { container } = render(
      <ChatSidebar
        messages={[{
          id: "math",
          role: "assistant",
          content: "인라인 $s_k$와 블록 수식:\n\n$$\\frac{du}{dt}=f(u)$$",
        }]}
        totalPages={3}
        selectedTexts={[]}
        busy={false}
        question=""
        onQuestion={vi.fn()}
        onRemoveSelection={vi.fn()}
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        onClear={vi.fn()}
        onPageClick={vi.fn()}
      />,
    );

    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll(".katex-html").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "답변 전체 복사" })).toBeInTheDocument();
  });
});
