import { describe, expect, it } from "vitest";
import {
  getPdfSelection,
  normalizePdfSelectionText,
  positionSelectionDock,
} from "./pdfSelection";

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
}) as DOMRect;

function selectionFor(
  anchorNode: Node,
  focusNode: Node,
  anchorOffset: number,
  focusOffset: number,
  text: string,
  rects: DOMRect[],
): Selection {
  const range = {
    getClientRects: () => rects,
    getBoundingClientRect: () => rects[0] ?? rect(0, 0, 0, 0),
  } as unknown as Range;
  return {
    anchorNode,
    focusNode,
    anchorOffset,
    focusOffset,
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => range,
    toString: () => text,
  } as unknown as Selection;
}

describe("PDF text selection helpers", () => {
  it("normalizes spacing while preserving paragraph boundaries and length", () => {
    expect(normalizePdfSelectionText("  첫째\u00a0 줄  \r\n\r\n\r\n 둘째\t줄  ")).toBe(
      "첫째 줄\n\n둘째 줄",
    );
    expect(normalizePdfSelectionText("가".repeat(20_010))).toHaveLength(20_000);
  });

  it("accepts only text-layer selections contained in one PDF page", () => {
    const root = document.createElement("main");
    root.innerHTML = `
      <section class="pdf-page-shell" data-page="3">
        <div class="react-pdf__Page__textContent"><span>첫 페이지</span></div>
      </section>
      <section class="pdf-page-shell" data-page="4">
        <div class="react-pdf__Page__textContent"><span>다음 페이지</span></div>
      </section>`;
    document.body.appendChild(root);
    const nodes = root.querySelectorAll("span");
    const firstNode = nodes[0].firstChild!;
    const secondNode = nodes[1].firstChild!;
    const selectionRect = rect(40, 60, 80, 18);

    const ready = getPdfSelection(
      root,
      selectionFor(firstNode, firstNode, 0, 4, " 첫   페이지 ", [selectionRect]),
    );
    expect(ready).toMatchObject({
      kind: "ready",
      selection: { text: "첫 페이지", pageNumber: 3 },
    });

    const crossPage = getPdfSelection(
      root,
      selectionFor(firstNode, secondNode, 0, 4, "두 페이지", [selectionRect]),
    );
    expect(crossPage).toMatchObject({ kind: "invalid", reason: "cross-page" });
    root.remove();
  });

  it("centers the selection dock at the bottom of the PDF viewport", () => {
    expect(positionSelectionDock(rect(100, 50, 800, 600))).toEqual({
      left: 220,
      top: 564,
      width: 560,
    });
  });
});
