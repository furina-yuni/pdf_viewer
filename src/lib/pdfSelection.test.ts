import { describe, expect, it } from "vitest";
import { normalizePdfSelectionText } from "./pdfSelection";

describe("PDF selection text normalization", () => {
  it("normalizes spacing while preserving paragraph boundaries and length", () => {
    expect(normalizePdfSelectionText("  첫째\u00a0 줄  \r\n\r\n\r\n 둘째\t줄  ")).toBe(
      "첫째 줄\n\n둘째 줄",
    );
    expect(normalizePdfSelectionText("가".repeat(20_010))).toHaveLength(20_000);
  });
});
