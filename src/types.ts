export type PageText = {
  pageNumber: number;
  text: string;
};

export type PdfTextSelection = {
  text: string;
  pageNumber: number;
};

export type AttachedPdfSelection = PdfTextSelection & {
  id: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pages?: number[];
  nearbyPages?: number[];
  ragPages?: number[];
  ragState?: RagState;
  tokenEstimate?: number;
  error?: boolean;
};

export type RagState = "missing" | "indexing" | "ready" | "stale" | "needs_api_key" | "error";

export type RagStatus = {
  state: RagState;
  indexed_pages: number;
  processed_pages: number[];
  total_pages: number;
  provider: string;
  embedding_model: string;
  rag_enabled: boolean;
  error: string | null;
  loadedFromCache?: boolean;
};
