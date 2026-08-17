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
