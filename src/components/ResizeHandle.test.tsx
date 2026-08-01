import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "./ResizeHandle";

describe("ResizeHandle", () => {
  afterEach(cleanup);

  it("allows the chat sidebar to grow beyond the old 720px limit", () => {
    const onWidth = vi.fn();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });
    render(<ResizeHandle width={700} onWidth={onWidth} />);

    const handle = screen.getByRole("separator", { name: "AI 창 너비 조절" });
    fireEvent(handle, new MouseEvent("pointerdown", { bubbles: true, clientX: 700 }));
    fireEvent(window, new MouseEvent("pointermove", { bubbles: true, clientX: 300 }));

    expect(onWidth).toHaveBeenLastCalledWith(1100);
  });

  it("stops only at the physical edge of the window", () => {
    const onWidth = vi.fn();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    render(<ResizeHandle width={700} onWidth={onWidth} />);

    const handle = screen.getByRole("separator", { name: "AI 창 너비 조절" });
    fireEvent(handle, new MouseEvent("pointerdown", { bubbles: true, clientX: 700 }));
    fireEvent(window, new MouseEvent("pointermove", { bubbles: true, clientX: 0 }));

    expect(onWidth).toHaveBeenLastCalledWith(993);
  });
});
