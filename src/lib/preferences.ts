export type ViewerPreferences = {
  before: number;
  after: number;
  scale: number;
  zoomMode: "fit" | "manual";
  chatWidth: number;
  chatOpen: boolean;
  toolbarVisible: boolean;
  viewerBackground: string;
};

const STORAGE_KEY = "study-pdf-ai-preferences-v1";

export const defaultPreferences: ViewerPreferences = {
  before: 1,
  after: 1,
  scale: 1.05,
  zoomMode: "fit",
  chatWidth: 440,
  chatOpen: true,
  toolbarVisible: true,
  viewerBackground: "#343941",
};

export function loadPreferences(storage: Storage = window.localStorage): ViewerPreferences {
  try {
    const desktopPreferences = window.desktop?.loadPreferences();
    const raw = storage.getItem(STORAGE_KEY);
    const parsed =
      desktopPreferences && typeof desktopPreferences === "object"
        ? desktopPreferences
        : raw
          ? (JSON.parse(raw) as Partial<ViewerPreferences>)
          : {};
    const legacyBackground = storage.getItem("pdf-viewer-background");
    return {
      before: clampNumber(parsed.before, 0, 10, defaultPreferences.before),
      after: clampNumber(parsed.after, 0, 10, defaultPreferences.after),
      scale: clampNumber(parsed.scale, 0.05, 5, defaultPreferences.scale),
      zoomMode:
        parsed.zoomMode === "fit" || parsed.zoomMode === "manual"
          ? parsed.zoomMode
          : typeof parsed.scale === "number"
            ? "manual"
            : defaultPreferences.zoomMode,
      chatWidth: clampMinimum(parsed.chatWidth, 320, defaultPreferences.chatWidth),
      chatOpen:
        typeof parsed.chatOpen === "boolean" ? parsed.chatOpen : defaultPreferences.chatOpen,
      toolbarVisible:
        typeof parsed.toolbarVisible === "boolean"
          ? parsed.toolbarVisible
          : defaultPreferences.toolbarVisible,
      viewerBackground: isHexColor(parsed.viewerBackground)
        ? parsed.viewerBackground
        : isHexColor(legacyBackground)
          ? legacyBackground
          : defaultPreferences.viewerBackground,
    };
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(
  preferences: ViewerPreferences,
  storage: Storage = window.localStorage,
): void {
  try {
    if (window.desktop?.isElectron) {
      window.desktop.savePreferences(preferences);
      return;
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function clampNumber(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function clampMinimum(value: number | undefined, minimum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, value)
    : fallback;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
