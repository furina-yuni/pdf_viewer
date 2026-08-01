import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar";

describe("Toolbar", () => {
  it("keeps range controls separate and accepts a typed zoom percentage", () => {
    const onScale = vi.fn();
    const onHide = vi.fn();
    const onBefore = vi.fn();
    const onAfter = vi.fn();
    const { container } = render(
      <Toolbar
        fileName="study.pdf"
        currentPage={5}
        totalPages={20}
        scale={1}
        zoomMode="manual"
        chatOpen
        before={2}
        after={3}
        contextPages={[3, 4, 5, 6, 7, 8]}
        onFile={vi.fn()}
        onScale={onScale}
        onFit={vi.fn()}
        onPage={vi.fn()}
        onBefore={onBefore}
        onAfter={onAfter}
        onToggleChat={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenAppearance={vi.fn()}
        onHide={onHide}
      />,
    );

    expect(container.querySelector(".toolbar-range")).not.toBe(
      container.querySelector(".reference-pages"),
    );

    const zoomInput = screen.getByRole("textbox", { name: "화면 비율" });
    fireEvent.change(zoomInput, { target: { value: "125" } });
    fireEvent.blur(zoomInput);
    expect(onScale).toHaveBeenCalledWith(1.25);

    fireEvent.click(screen.getByRole("button", { name: "위 참고 페이지 줄이기" }));
    expect(onBefore).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "위 참고 페이지 늘리기" }));
    expect(onBefore).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "아래 참고 페이지 줄이기" }));
    expect(onAfter).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "아래 참고 페이지 늘리기" }));
    expect(onAfter).toHaveBeenCalledWith(4);

    fireEvent.click(screen.getByRole("button", { name: "상단 바 숨기기" }));
    expect(onHide).toHaveBeenCalledOnce();
  });
});
