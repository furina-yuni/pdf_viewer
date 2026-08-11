import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultPreferences,
  loadPreferences,
  savePreferences,
  type ViewerPreferences,
} from "./preferences";

describe("viewer preferences", () => {
  beforeEach(() => localStorage.clear());

  it("restores saved viewer settings", () => {
    const preferences: ViewerPreferences = {
      before: 3,
      after: 4,
      scale: 1.35,
      zoomMode: "manual",
      chatWidth: 560,
      chatWidthRatio: 0.46,
      chatOpen: false,
      toolbarVisible: false,
      viewerBackground: "#202a3a",
      historyQuestionLimit: 6,
    };
    savePreferences(preferences);
    expect(loadPreferences()).toEqual(preferences);
  });

  it("uses safe defaults for invalid saved values", () => {
    localStorage.setItem(
      "study-pdf-ai-preferences-v1",
      JSON.stringify({ before: 99, scale: "large", chatWidth: 1 }),
    );
    expect(loadPreferences()).toMatchObject({
      before: 10,
      scale: defaultPreferences.scale,
      zoomMode: "fit",
      chatWidth: 320,
      chatWidthRatio: defaultPreferences.chatWidthRatio,
    });
  });

  it("keeps an older saved scale in manual zoom mode", () => {
    localStorage.setItem(
      "study-pdf-ai-preferences-v1",
      JSON.stringify({ scale: 1.2 }),
    );

    expect(loadPreferences()).toMatchObject({
      scale: 1.2,
      zoomMode: "manual",
    });
  });

  it("restores chat widths larger than the old 720px limit", () => {
    localStorage.setItem(
      "study-pdf-ai-preferences-v1",
      JSON.stringify({ chatWidth: 1200 }),
    );

    expect(loadPreferences()).toMatchObject({ chatWidth: 1200 });
  });

  it("uses the Electron user-data store when it is available", () => {
    const preferences: ViewerPreferences = {
      ...defaultPreferences,
      before: 4,
      after: 3,
      scale: 1.2,
      zoomMode: "manual",
    };
    const writes: ViewerPreferences[] = [];
    const previousDesktop = window.desktop;
    window.desktop = {
      isElectron: true,
      platform: "win32",
      loadPreferences: () => preferences,
      savePreferences: (nextPreferences) => writes.push(nextPreferences),
      listRecentPdfs: async () => [],
      openPdfDialog: async () => null,
      openRecentPdf: async () => null,
    };

    try {
      expect(loadPreferences()).toMatchObject({
        before: 4,
        after: 3,
        scale: 1.2,
        zoomMode: "manual",
      });
      savePreferences(preferences);
      expect(writes).toEqual([preferences]);
    } finally {
      window.desktop = previousDesktop;
    }
  });
});
