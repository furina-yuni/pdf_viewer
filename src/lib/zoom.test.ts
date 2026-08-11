import { describe, expect, it } from "vitest";
import { snapZoomScale, stepZoomScale } from "./zoom";

describe("zoom steps", () => {
  it("snaps typed zoom values to the nearest five percent", () => {
    expect(snapZoomScale(1.13)).toBe(1.15);
    expect(snapZoomScale(1.12)).toBe(1.1);
  });

  it("moves to the adjacent five-percent boundary", () => {
    expect(stepZoomScale(1.13, 1)).toBe(1.15);
    expect(stepZoomScale(1.13, -1)).toBe(1.1);
    expect(stepZoomScale(1.15, 1)).toBe(1.2);
    expect(stepZoomScale(1.15, -1)).toBe(1.1);
  });
});
