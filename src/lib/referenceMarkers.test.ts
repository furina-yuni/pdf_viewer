import { describe, expect, it } from "vitest";
import { getReferenceMarkers } from "./referenceMarkers";

describe("getReferenceMarkers", () => {
  it("shows the range start, current page, and range end", () => {
    expect(getReferenceMarkers([3, 4, 5, 6, 7, 8], 5)).toEqual([
      3,
      "ellipsis",
      5,
      "ellipsis",
      8,
    ]);
  });

  it("does not duplicate markers at document boundaries", () => {
    expect(getReferenceMarkers([1, 2, 3], 1)).toEqual([1, "ellipsis", 3]);
    expect(getReferenceMarkers([8, 9, 10], 10)).toEqual([8, "ellipsis", 10]);
  });

  it("shows adjacent pages without ellipses", () => {
    expect(getReferenceMarkers([4, 5, 6], 5)).toEqual([4, 5, 6]);
  });
});
