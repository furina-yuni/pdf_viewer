import type { ViewerPreferences } from "./lib/preferences";

export type RecentPdf = {
  name: string;
  path: string;
  openedAt: string;
};

export type OpenedPdf = {
  name: string;
  path: string;
  data: ArrayBuffer;
};

declare global {
  interface Window {
    desktop?: {
      isElectron: boolean;
      platform: string;
      loadPreferences: () => Partial<ViewerPreferences> | null;
      savePreferences: (preferences: ViewerPreferences) => void;
      listRecentPdfs: () => Promise<RecentPdf[]>;
      openPdfDialog: () => Promise<OpenedPdf | null>;
      openRecentPdf: (filePath: string) => Promise<OpenedPdf | null>;
    };
  }
}

export {};
