import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "./ResizeHandle";

describe("ResizeHandle", () => {
  afterEach(cleanup);

  it("stores the dragged sidebar width as a workspace ratio", () => {
    const onRatio = vi.fn();
    render(<div><ResizeHandle ratio={0.5} onRatio={onRatio} /></div>);

    const handle = screen.getByRole("separator", { name: "AI 창 너비 조절" });
    vi.spyOn(handle.parentElement!, "getBoundingClientRect").mockReturnValue({
      left: 0, right: 1400, width: 1400, top: 0, bottom: 900, height: 900, x: 0, y: 0,
      toJSON: () => ({}),
    });
    fireEvent(handle, new MouseEvent("pointerdown", { bubbles: true, clientX: 700 }));
    fireEvent(window, new MouseEvent("pointermove", { bubbles: true, clientX: 300 }));

    expect(onRatio).toHaveBeenLastCalledWith(1100 / 1400);
  });

  it("stops only at the physical edge of the window", () => {
    const onRatio = vi.fn();
    render(<div><ResizeHandle ratio={0.7} onRatio={onRatio} /></div>);

    const handle = screen.getByRole("separator", { name: "AI 창 너비 조절" });
    vi.spyOn(handle.parentElement!, "getBoundingClientRect").mockReturnValue({
      left: 0, right: 1000, width: 1000, top: 0, bottom: 900, height: 900, x: 0, y: 0,
      toJSON: () => ({}),
    });
    fireEvent(handle, new MouseEvent("pointerdown", { bubbles: true, clientX: 700 }));
    fireEvent(window, new MouseEvent("pointermove", { bubbles: true, clientX: 0 }));

    expect(onRatio).toHaveBeenLastCalledWith(0.993);
  });
});
