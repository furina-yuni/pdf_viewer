export type PdfSelectionSnapshot = {
  text: string;
  pageNumber: number;
};

export type PdfSelectionResult =
  | { kind: "ready"; selection: PdfSelectionSnapshot }
  | { kind: "invalid"; reason: "outside" | "cross-page" | "empty" };

export type SelectionDockPosition = {
  left: number;
  top: number;
  width: number;
};

const PAGE_SELECTOR = ".pdf-page-shell[data-page]";
const TEXT_LAYER_SELECTOR = ".react-pdf__Page__textContent";

export function normalizePdfSelectionText(text: string, maxLength = 20_000): string {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized.slice(0, maxLength);
}

export function getPdfSelection(
  root: HTMLElement,
  selection: Selection | null,
): PdfSelectionResult {
  if (
    !selection ||
    selection.isCollapsed ||
    selection.rangeCount === 0 ||
    !selection.anchorNode ||
    !selection.focusNode ||
    !root.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)
  ) {
    return { kind: "invalid", reason: "outside" };
  }

  const anchorLayer = closestElement(selection.anchorNode, TEXT_LAYER_SELECTOR);
  const focusLayer = closestElement(selection.focusNode, TEXT_LAYER_SELECTOR);
  const anchorPage = closestElement(selection.anchorNode, PAGE_SELECTOR);
  const focusPage = closestElement(selection.focusNode, PAGE_SELECTOR);

  if (!anchorLayer || !focusLayer || !anchorPage || !focusPage) {
    return { kind: "invalid", reason: "outside" };
  }
  if (anchorPage !== focusPage) {
    return { kind: "invalid", reason: "cross-page" };
  }

  const pageNumber = Number(anchorPage.getAttribute("data-page"));
  const text = normalizePdfSelectionText(selection.toString());
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || !text) {
    return { kind: "invalid", reason: "empty" };
  }
  return { kind: "ready", selection: { text, pageNumber } };
}

export function positionSelectionDock(
  viewer: Pick<DOMRect, "left" | "top" | "bottom" | "width">,
  dockHeight = 70,
  margin = 16,
): SelectionDockPosition {
  const width = Math.min(560, Math.max(0, viewer.width - margin * 2));
  return {
    left: viewer.left + (viewer.width - width) / 2,
    top: Math.max(viewer.top + margin, viewer.bottom - dockHeight - margin),
    width,
  };
}

function closestElement(node: Node, selector: string): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest<HTMLElement>(selector) ?? null;
}
