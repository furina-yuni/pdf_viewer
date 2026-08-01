export type ReferenceMarker = number | "ellipsis";

export function getReferenceMarkers(
  pages: number[],
  currentPage: number,
): ReferenceMarker[] {
  if (pages.length === 0) return [];

  const first = pages[0];
  const last = pages[pages.length - 1];
  const positions = [...new Set([first, currentPage, last])].sort((a, b) => a - b);
  const markers: ReferenceMarker[] = [];

  positions.forEach((page, index) => {
    const previous = positions[index - 1];
    if (previous !== undefined && page - previous > 1) markers.push("ellipsis");
    markers.push(page);
  });
  return markers;
}
