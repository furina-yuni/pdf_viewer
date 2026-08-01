export function getPageRange(
  currentPage: number,
  totalPages: number,
  before: number,
  after: number,
): number[] {
  if (totalPages < 1) return [];
  const safeCurrent = Math.min(Math.max(1, currentPage), totalPages);
  const start = Math.max(1, safeCurrent - Math.max(0, before));
  const end = Math.min(totalPages, safeCurrent + Math.max(0, after));
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

