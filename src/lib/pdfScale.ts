export function getHeightFitScale(containerHeight: number, pageHeight: number): number {
  if (containerHeight <= 0 || pageHeight <= 0) return 1;
  return Math.max(0.05, containerHeight / pageHeight);
}
