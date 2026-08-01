import { describe, expect, it } from "vitest";
import { createTheme } from "./theme";

describe("createTheme", () => {
  it("creates readable dark-theme surfaces", () => {
    const theme = createTheme("#343941");
    expect(theme["--panel-background"]).not.toBe("#343941");
    expect(theme["--theme-text"]).toBe("#f1f4f8");
  });

  it("creates readable light-theme surfaces", () => {
    const theme = createTheme("#dfe3e8");
    expect(theme["--theme-text"]).toBe("#252b35");
    expect(theme["--surface-raised"]).not.toBe("#dfe3e8");
  });
});
