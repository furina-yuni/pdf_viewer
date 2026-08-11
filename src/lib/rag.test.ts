import { describe, expect, it } from "vitest";
import { pageBatches } from "./rag";

describe("pageBatches", () => {
  it("skips completed pages and keeps batches bounded", () => {
    expect(pageBatches(10, [1, 2, 9], 3)).toEqual([[3, 4, 5], [6, 7, 8], [10]]);
  });
});
