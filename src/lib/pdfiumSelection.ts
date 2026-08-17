import type { PdfTextSelection } from "../types";
import { normalizePdfSelectionText } from "./pdfSelection";

export function createPdfiumTextSelection(
  lines: string[],
  formatted: Array<{ pageIndex: number }>,
  fallbackPageIndex: number,
): PdfTextSelection | null {
  const text = normalizePdfSelectionText(lines.join("\n"));
  if (!text) return null;
  return {
    text,
    pageNumber: (formatted[0]?.pageIndex ?? fallbackPageIndex) + 1,
  };
}
