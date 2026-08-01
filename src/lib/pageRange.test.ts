import { describe, expect, it } from "vitest";
import { getPageRange } from "./pageRange";

describe("getPageRange", () => {
  it("returns pages around the current page", () => {
    expect(getPageRange(20, 100, 2, 3)).toEqual([18, 19, 20, 21, 22, 23]);
  });

  it("clamps the range at document boundaries", () => {
    expect(getPageRange(1, 3, 5, 5)).toEqual([1, 2, 3]);
  });
});

