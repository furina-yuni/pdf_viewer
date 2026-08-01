import { describe, expect, it } from "vitest";
import { getHeightFitScale } from "./pdfScale";

describe("getHeightFitScale", () => {
  it("uses the full viewer height without a vertical margin", () => {
    const scale = getHeightFitScale(900, 1200);
    expect(scale).toBe(0.75);
    expect(1200 * scale).toBe(900);
  });

  it("supports fullscreen-sized viewers", () => {
    expect(getHeightFitScale(1440, 900)).toBe(1.6);
  });
});
