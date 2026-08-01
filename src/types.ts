export type PageText = {
  pageNumber: number;
  text: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pages?: number[];
  tokenEstimate?: number;
  error?: boolean;
};

