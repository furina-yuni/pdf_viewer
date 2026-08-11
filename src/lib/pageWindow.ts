export function getRenderWindow(center: number, totalPages: number, radius = 2): number[] {
  if (totalPages <= 0) return [];
  const safeCenter = Math.min(totalPages, Math.max(1, center));
  const start = Math.max(1, safeCenter - radius);
  const end = Math.min(totalPages, safeCenter + radius);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
