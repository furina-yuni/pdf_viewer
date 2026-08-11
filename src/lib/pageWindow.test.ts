import { describe, expect, it } from "vitest";
import { getRenderWindow } from "./pageWindow";

describe("PDF render window", () => {
  it("renders at most five pages around the current page", () => {
    expect(getRenderWindow(50, 100)).toEqual([48, 49, 50, 51, 52]);
    expect(getRenderWindow(250, 500)).toHaveLength(5);
  });

  it("clamps the window at document boundaries", () => {
    expect(getRenderWindow(1, 100)).toEqual([1, 2, 3]);
    expect(getRenderWindow(100, 100)).toEqual([98, 99, 100]);
  });
});
