import { describe, expect, it } from "vitest";
import { createPdfiumTextSelection } from "../lib/pdfiumSelection";

describe("PDFium selection conversion", () => {
  it("preserves selected lines and reports the PDF page", () => {
    expect(createPdfiumTextSelection(
      ["  첫 번째   줄", "둘째\u00a0줄  "],
      [{ pageIndex: 5 }],
      0,
    )).toEqual({ text: "첫 번째 줄\n둘째 줄", pageNumber: 6 });
  });

  it("uses the active selection layer page and ignores empty selections", () => {
    expect(createPdfiumTextSelection(["Chrome style"], [], 3)).toEqual({
      text: "Chrome style",
      pageNumber: 4,
    });
    expect(createPdfiumTextSelection(["   "], [], 3)).toBeNull();
  });
});
