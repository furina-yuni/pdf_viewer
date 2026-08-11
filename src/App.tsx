import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";
import { ChevronDown } from "lucide-react";
import { AppearanceModal } from "./components/AppearanceModal";
import { ChatSidebar } from "./components/ChatSidebar";
import { PdfViewer } from "./components/PdfViewer";
import { ResizeHandle } from "./components/ResizeHandle";
import { SettingsModal } from "./components/SettingsModal";
import { Toolbar } from "./components/Toolbar";
import { getPageRange } from "./lib/pageRange";
import { getRecentQuestionHistory } from "./lib/chatHistory";
import { loadPreferences, savePreferences } from "./lib/preferences";
import { createTheme } from "./lib/theme";
import { streamSse } from "./lib/sse";
import { stepZoomScale } from "./lib/zoom";
import { acquireBackend, type BackendLease } from "./lib/backend";
import { createDocumentKey, pageBatches } from "./lib/rag";
import type { AttachedPdfSelection, ChatMessage, PageText, RagStatus } from "./types";
import type { OpenedPdf, RecentPdf } from "./electron";

function App() {
  const savedPreferences = useMemo(() => loadPreferences(), []);
  const [file, setFile] = useState<File | string | null>(null);
  const [fileName, setFileName] = useState("");
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [navigationRequest, setNavigationRequest] = useState<{
    page: number;
    sequence: number;
  } | null>(null);
  const [scale, setScale] = useState(savedPreferences.scale);
  const [zoomMode, setZoomMode] = useState(savedPreferences.zoomMode);
  const [chatOpen, setChatOpen] = useState(savedPreferences.chatOpen);
  const [chatWidthRatio, setChatWidthRatio] = useState(savedPreferences.chatWidthRatio);
  const [toolbarVisible, setToolbarVisible] = useState(savedPreferences.toolbarVisible);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [viewerBackground, setViewerBackground] = useState(savedPreferences.viewerBackground);
  const [before, setBefore] = useState(savedPreferences.before);
  const [after, setAfter] = useState(savedPreferences.after);
  const [historyQuestionLimit, setHistoryQuestionLimit] = useState(
    savedPreferences.historyQuestionLimit,
  );
  const [recentPdfs, setRecentPdfs] = useState<RecentPdf[]>([]);
  const [recentError, setRecentError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [selectedTexts, setSelectedTexts] = useState<AttachedPdfSelection[]>([]);
  const [busy, setBusy] = useState(false);
  const [documentKey, setDocumentKey] = useState<string | null>(null);
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null);
  const [ragGeneration, setRagGeneration] = useState(0);
  const [ragStartRequested, setRagStartRequested] = useState(false);
  const [ragIndexing, setRagIndexing] = useState(false);
  const [, setNotice] = useState("");
  const textCache = useRef(new Map<number, string>());
  const abortRef = useRef<AbortController | null>(null);
  const ragAbortRef = useRef<AbortController | null>(null);
  const currentPageRef = useRef(1);
  const documentIdRef = useRef<string | null>(null);

  const totalPages = document?.numPages ?? 0;
  const contextPages = useMemo(
    () => getPageRange(currentPage, totalPages, before, after),
    [currentPage, totalPages, before, after],
  );
  const themeVariables = useMemo(
    () => createTheme(viewerBackground) as CSSProperties,
    [viewerBackground],
  );

  useEffect(() => {
    savePreferences({
      before,
      after,
      scale,
      zoomMode,
      chatWidth: Math.round(window.innerWidth * chatWidthRatio),
      chatWidthRatio,
      chatOpen,
      toolbarVisible,
      viewerBackground,
      historyQuestionLimit,
    });
  }, [after, before, chatOpen, chatWidthRatio, historyQuestionLimit, scale, toolbarVisible, viewerBackground, zoomMode]);

  const refreshRecentPdfs = useCallback(async () => {
    if (!window.desktop?.isElectron) return;
    setRecentPdfs(await window.desktop.listRecentPdfs());
  }, []);

  useEffect(() => {
    void refreshRecentPdfs();
  }, [refreshRecentPdfs]);

  const navigateToPage = useCallback(
    (requestedPage: number) => {
      if (!document) return;
      const page = Math.min(document.numPages, Math.max(1, requestedPage));
      currentPageRef.current = page;
      setCurrentPage(page);
      setNavigationRequest((request) => ({
        page,
        sequence: (request?.sequence ?? 0) + 1,
      }));
    },
    [document],
  );

  const handleObservedPage = useCallback((page: number) => {
    currentPageRef.current = page;
    setCurrentPage(page);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (!isEditing && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setToolbarVisible((visible) => !visible);
        return;
      }
      if (
        !document ||
        settingsOpen ||
        appearanceOpen ||
        isEditing
      ) {
        return;
      }
      if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        return;
      }
      if (event.ctrlKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        setScale((currentScale) => stepZoomScale(currentScale, event.key === "ArrowUp" ? 1 : -1));
        setZoomMode("manual");
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        navigateToPage(currentPageRef.current + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        navigateToPage(currentPageRef.current - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appearanceOpen, document, navigateToPage, settingsOpen]);

  const resetPdf = useCallback((source: File | string, name: string, documentId: string | null) => {
    abortRef.current?.abort();
    ragAbortRef.current?.abort();
    textCache.current.clear();
    const previousDocumentId = documentIdRef.current;
    if (previousDocumentId && previousDocumentId !== documentId) {
      void window.desktop?.releasePdf(previousDocumentId);
    }
    documentIdRef.current = documentId;
    setFile(source);
    setFileName(name);
    setDocument(null);
    setDocumentKey(null);
    setRagStatus(null);
    setCurrentPage(1);
    currentPageRef.current = 1;
    setNavigationRequest(null);
    setMessages([]);
    setSelectedTexts([]);
    setNotice("");
  }, []);

  const handleFile = useCallback((nextFile: File) => {
    resetPdf(nextFile, nextFile.name, null);
  }, [resetPdf]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      ragAbortRef.current?.abort();
      const documentId = documentIdRef.current;
      if (documentId) void window.desktop?.releasePdf(documentId);
    },
    [],
  );

  const handleOpenedPdf = useCallback(
    (opened: OpenedPdf) => {
      resetPdf(opened.sourceUrl, opened.name, opened.documentId);
      setRecentError("");
      void refreshRecentPdfs();
    },
    [refreshRecentPdfs, resetPdf],
  );

  const openPdfDialog = useCallback(async () => {
    const opened = await window.desktop?.openPdfDialog();
    if (opened) handleOpenedPdf(opened);
  }, [handleOpenedPdf]);

  const openRecentPdf = useCallback(
    async (filePath: string) => {
      const opened = await window.desktop?.openRecentPdf(filePath);
      if (opened) {
        handleOpenedPdf(opened);
        return;
      }
      setRecentError("파일이 이동되었거나 삭제되어 열 수 없습니다.");
      await refreshRecentPdfs();
    },
    [handleOpenedPdf, refreshRecentPdfs],
  );

  const handleLoad = useCallback((nextDocument: PDFDocumentProxy) => {
    setDocument(nextDocument);
    setNotice(`${nextDocument.numPages}페이지 문서를 불러왔습니다.`);
  }, []);

  const extractPages = useCallback(
    async (pages: number[]): Promise<PageText[]> => {
      if (!document) return [];
      return Promise.all(
        pages.map(async (pageNumber) => {
          let text = textCache.current.get(pageNumber);
          if (text == null) {
            const page = await document.getPage(pageNumber);
            const content = await page.getTextContent();
            text = content.items
              .filter((item): item is TextItem => "str" in item)
              .map((item) => item.str)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
            textCache.current.set(pageNumber, text);
            while (textCache.current.size > 64) {
              const oldestPage = textCache.current.keys().next().value;
              if (oldestPage === undefined) break;
              textCache.current.delete(oldestPage);
            }
          } else {
            textCache.current.delete(pageNumber);
            textCache.current.set(pageNumber, text);
          }
          return { pageNumber, text: text || "(이 페이지에서 텍스트를 추출하지 못했습니다.)" };
        }),
      );
    },
    [document],
  );

  useEffect(() => {
    if (!document) return;
    const controller = new AbortController();
    ragAbortRef.current?.abort();
    ragAbortRef.current = controller;
    let backendLease: BackendLease | null = null;
    let cancelled = false;

    const postJson = async (baseUrl: string, path: string, body: object) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as RagStatus & { detail?: string };
      if (!response.ok) throw new Error(payload.detail || "문서 검색 색인 요청에 실패했습니다.");
      return payload;
    };

    const run = async () => {
      const key = await createDocumentKey(document);
      if (cancelled) return;
      setDocumentKey(key);
      backendLease = await acquireBackend();
      const request = {
        document_key: key,
        document_name: fileName || "document.pdf",
        total_pages: document.numPages,
      };
      let status = await postJson(backendLease.baseUrl, "/api/rag/documents/status", request);
      if (cancelled) return;
      if (status.state === "ready") status = { ...status, loadedFromCache: true };
      setRagStatus(status);
      if (
        !ragStartRequested
        || !status.rag_enabled
        || status.state === "ready"
        || status.state === "needs_api_key"
      ) return;

      setRagIndexing(true);
      status = { ...status, state: "indexing", error: null, loadedFromCache: false };
      setRagStatus(status);

      for (const batch of pageBatches(document.numPages, status.processed_pages)) {
        const pages: PageText[] = [];
        for (let start = 0; start < batch.length; start += 2) {
          if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
          pages.push(...await extractPages(batch.slice(start, start + 2)));
        }
        status = await postJson(
          backendLease.baseUrl,
          `/api/rag/documents/${encodeURIComponent(key)}/pages`,
          {
            document_name: request.document_name,
            total_pages: document.numPages,
            pages: pages.map((page) => ({ page_number: page.pageNumber, text: page.text })),
          },
        );
        if (!cancelled) setRagStatus(status);
      }
      status = await postJson(
        backendLease.baseUrl,
        `/api/rag/documents/${encodeURIComponent(key)}/finalize`,
        request,
      );
      if (!cancelled) setRagStatus(status);
    };

    void run().catch((reason: unknown) => {
      if (cancelled || (reason instanceof DOMException && reason.name === "AbortError")) return;
      setRagStatus((current) => ({
        state: "error",
        indexed_pages: current?.indexed_pages ?? 0,
        processed_pages: current?.processed_pages ?? [],
        total_pages: document.numPages,
        provider: current?.provider ?? "",
        embedding_model: current?.embedding_model ?? "",
        rag_enabled: current?.rag_enabled ?? true,
        error: reason instanceof Error ? reason.message : "문서 검색 색인 오류",
      }));
    }).finally(async () => {
      await backendLease?.release();
      setRagStartRequested(false);
      setRagIndexing(false);
      if (ragAbortRef.current === controller) ragAbortRef.current = null;
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [document, extractPages, fileName, ragGeneration]);

  const startRagIndex = useCallback(() => {
    if (!document) return;
    setRagStartRequested(true);
    setRagIndexing(true);
    setRagGeneration((value) => value + 1);
  }, [document]);

  const deleteRagIndex = useCallback(async () => {
    if (!documentKey || !document) return;
    ragAbortRef.current?.abort();
    const lease = await acquireBackend();
    try {
      const response = await fetch(
        `${lease.baseUrl}/api/rag/documents/${encodeURIComponent(documentKey)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("색인을 삭제하지 못했습니다.");
      setRagStatus((current) => current ? {
        ...current,
        state: "missing",
        indexed_pages: 0,
        processed_pages: [],
        error: null,
        loadedFromCache: false,
      } : null);
    } finally {
      await lease.release();
    }
  }, [document, documentKey]);

  const rebuildRagIndex = useCallback(async () => {
    try {
      await deleteRagIndex();
      setRagStartRequested(true);
      setRagIndexing(true);
      setRagGeneration((value) => value + 1);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "색인을 다시 만들지 못했습니다.");
    }
  }, [deleteRagIndex]);

  const submitQuestion = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed || !document || busy) return;

    const pageSnapshot = currentPage;
    const rangeSnapshot = getPageRange(pageSnapshot, document.numPages, before, after);
    const attachedSelection = selectedTexts.length > 0
      ? selectedTexts
        .map((item, index) => `[인용 ${index + 1} · p.${item.pageNumber}]\n${item.text}`)
        .join("\n\n")
      : null;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();
    const historySnapshot = getRecentQuestionHistory(messages, historyQuestionLimit);

    setMessages((items) => [
      ...items,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setQuestion("");
    setSelectedTexts([]);
    setBusy(true);
    setNotice("참고 페이지 텍스트를 준비하는 중…");

    const controller = new AbortController();
    abortRef.current = controller;
    let backendLease: BackendLease | null = null;

    try {
      const pages = await extractPages(rangeSnapshot);
      setNotice(`${rangeSnapshot[0]}~${rangeSnapshot.at(-1)}페이지를 참고해 답변 중…`);
      backendLease = await acquireBackend();

      await streamSse(
        `${backendLease.baseUrl}/api/chat/stream`,
        {
          question: trimmed,
          current_page: pageSnapshot,
          total_pages: document.numPages,
          page_range: { before, after },
          pages: pages.map((page) => ({
            page_number: page.pageNumber,
            text: page.text,
          })),
          selected_text: attachedSelection,
          history: historySnapshot.map(({ role, content }) => ({ role, content })),
          document_key: documentKey,
          use_rag: ragStatus?.rag_enabled ?? true,
        },
        controller.signal,
        (event, data) => {
          if (event === "message_start") {
            setMessages((items) =>
              items.map((item) =>
                item.id === assistantId
                  ? {
                      ...item,
                      pages: data.pages as number[],
                      nearbyPages: data.nearby_pages as number[],
                      ragPages: data.rag_pages as number[],
                      ragState: data.rag_state as ChatMessage["ragState"],
                      tokenEstimate: data.estimated_context_tokens as number,
                    }
                  : item,
              ),
            );
          }
          if (event === "content_delta") {
            setMessages((items) =>
              items.map((item) =>
                item.id === assistantId
                  ? { ...item, content: item.content + String(data.content) }
                  : item,
              ),
            );
          }
          if (event === "error") throw new Error(String(data.message));
        },
      );
      setNotice("답변이 완료되었습니다.");
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setNotice("답변 생성을 중지했습니다.");
      } else {
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        setMessages((items) =>
          items.map((item) =>
            item.id === assistantId
              ? { ...item, content: `오류가 발생했습니다: ${message}`, error: true }
              : item,
          ),
        );
        setNotice("AI 요청에 실패했습니다.");
      }
    } finally {
      await backendLease?.release();
      abortRef.current = null;
      setBusy(false);
    }
  }, [after, before, busy, currentPage, document, documentKey, extractPages, historyQuestionLimit, messages, question, ragStatus?.rag_enabled, selectedTexts]);

  return (
    <div
      className={`app-shell ${toolbarVisible ? "" : "toolbar-hidden"}`}
      style={themeVariables}
    >
      {toolbarVisible ? <Toolbar
        fileName={fileName}
        currentPage={currentPage}
        totalPages={totalPages}
        scale={scale}
        zoomMode={zoomMode}
        chatOpen={chatOpen}
        before={before}
        after={after}
        contextPages={contextPages}
        desktopMode={window.desktop?.isElectron}
        onFile={handleFile}
        onOpenFile={() => void openPdfDialog()}
        onScale={(nextScale) => {
          setScale(nextScale);
          setZoomMode("manual");
        }}
        onFit={() => setZoomMode("fit")}
        onPage={navigateToPage}
        onBefore={setBefore}
        onAfter={setAfter}
        onToggleChat={() => setChatOpen((open) => !open)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAppearance={() => setAppearanceOpen(true)}
        onHide={() => setToolbarVisible(false)}
      /> : (
        <button
          className="toolbar-show-button"
          onClick={() => setToolbarVisible(true)}
          aria-label="상단 바 표시"
          title="상단 바 표시 (Shift+F)"
        >
          <ChevronDown size={18} />
        </button>
      )}
      <div
        className={`workspace ${chatOpen ? "with-chat" : ""}`}
        style={{ "--chat-ratio": `${chatWidthRatio * 100}%` } as CSSProperties}
      >
        <PdfViewer
          file={file}
          document={document}
          totalPages={totalPages}
          navigationRequest={navigationRequest}
          scale={scale}
          autoFit={zoomMode === "fit"}
          recentPdfs={recentPdfs}
          recentError={recentError}
          onOpenFile={() => void openPdfDialog()}
          onOpenRecent={(filePath) => void openRecentPdf(filePath)}
          onLoad={handleLoad}
          onScale={setScale}
          onCurrentPage={handleObservedPage}
          onTextSelection={(selection) => {
            setSelectedTexts((items) => [
              ...items,
              { id: crypto.randomUUID(), ...selection },
            ]);
            setNotice("선택한 텍스트를 질문에 첨부했습니다.");
          }}
          onError={(message) => setNotice(`PDF 오류: ${message}`)}
        />
        {chatOpen && (
          <>
            <ResizeHandle ratio={chatWidthRatio} onRatio={setChatWidthRatio} />
            <ChatSidebar
              messages={messages}
              totalPages={totalPages}
              selectedTexts={selectedTexts}
              busy={busy}
              question={question}
              ragStatus={ragStatus}
              ragIndexing={ragIndexing}
              onQuestion={setQuestion}
              onRemoveSelection={(id) => {
                setSelectedTexts((items) => items.filter((item) => item.id !== id));
              }}
              onSubmit={submitQuestion}
              onStop={() => abortRef.current?.abort()}
              onClear={() => setMessages([])}
              onPageClick={navigateToPage}
              onRetryRag={startRagIndex}
              onReindexRag={() => void rebuildRagIndex()}
              onDeleteRag={() => void deleteRagIndex().catch((reason: unknown) => {
                setNotice(reason instanceof Error ? reason.message : "색인을 삭제하지 못했습니다.");
              })}
            />
          </>
        )}
      </div>
      <SettingsModal
        open={settingsOpen}
        historyQuestionLimit={historyQuestionLimit}
        ragStatus={ragStatus}
        ragIndexing={ragIndexing}
        totalPages={totalPages}
        onClose={() => setSettingsOpen(false)}
        onSaved={setNotice}
        onRagSettingsChanged={() => setRagGeneration((value) => value + 1)}
        onStartRag={startRagIndex}
        onReindexRag={() => void rebuildRagIndex()}
        onHistoryQuestionLimit={setHistoryQuestionLimit}
      />
      <AppearanceModal
        open={appearanceOpen}
        color={viewerBackground}
        onClose={() => setAppearanceOpen(false)}
        onSave={(color) => {
          setViewerBackground(color);
          setNotice("전체 배경색을 저장했습니다.");
        }}
      />
    </div>
  );
}

export default App;
