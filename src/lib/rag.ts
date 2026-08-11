import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

export async function createDocumentKey(document: PDFDocumentProxy): Promise<string> {
  const fingerprint = document.fingerprints[0] || `pages-${document.numPages}`;
  const source = new TextEncoder().encode(`${fingerprint}:${document.numPages}`);
  const digest = await crypto.subtle.digest("SHA-256", source);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `pdf-${hex}`;
}

export function pageBatches(
  totalPages: number,
  processedPages: number[],
  batchSize = 8,
): number[][] {
  const processed = new Set(processedPages);
  const pending = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => !processed.has(page));
  const batches: number[][] = [];
  for (let start = 0; start < pending.length; start += batchSize) {
    batches.push(pending.slice(start, start + batchSize));
  }
  return batches;
}
