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
import { loadPreferences, savePreferences } from "./lib/preferences";
import { createTheme } from "./lib/theme";
import { streamSse } from "./lib/sse";
import type { ChatMessage, PageText } from "./types";
import type { OpenedPdf, RecentPdf } from "./electron";

function App() {
  const savedPreferences = useMemo(() => loadPreferences(), []);
  const [file, setFile] = useState<File | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [navigationRequest, setNavigationRequest] = useState<{
    page: number;
    sequence: number;
  } | null>(null);
  const [scale, setScale] = useState(savedPreferences.scale);
  const [zoomMode, setZoomMode] = useState(savedPreferences.zoomMode);
  const [chatOpen, setChatOpen] = useState(savedPreferences.chatOpen);
  const [chatWidth, setChatWidth] = useState(savedPreferences.chatWidth);
  const [toolbarVisible, setToolbarVisible] = useState(savedPreferences.toolbarVisible);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [viewerBackground, setViewerBackground] = useState(savedPreferences.viewerBackground);
  const [before, setBefore] = useState(savedPreferences.before);
  const [after, setAfter] = useState(savedPreferences.after);
  const [recentPdfs, setRecentPdfs] = useState<RecentPdf[]>([]);
  const [recentError, setRecentError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [busy, setBusy] = useState(false);
  const [, setNotice] = useState("");
  const textCache = useRef(new Map<number, string>());
  const abortRef = useRef<AbortController | null>(null);
  const currentPageRef = useRef(1);

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
      chatWidth,
      chatOpen,
      toolbarVisible,
      viewerBackground,
    });
  }, [after, before, chatOpen, chatWidth, scale, toolbarVisible, viewerBackground, zoomMode]);

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

  const handleFile = useCallback((nextFile: File) => {
    abortRef.current?.abort();
    textCache.current.clear();
    setFile(nextFile);
    setDocument(null);
    setCurrentPage(1);
    currentPageRef.current = 1;
    setNavigationRequest(null);
    setMessages([]);
    setSelectedText("");
    setNotice("");
  }, []);

  const handleOpenedPdf = useCallback(
    (opened: OpenedPdf) => {
      handleFile(new File([opened.data], opened.name, { type: "application/pdf" }));
      setRecentError("");
      void refreshRecentPdfs();
    },
    [handleFile, refreshRecentPdfs],
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
          }
          return { pageNumber, text: text || "(이 페이지에서 텍스트를 추출하지 못했습니다.)" };
        }),
      );
    },
    [document],
  );

  const submitQuestion = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed || !document || busy) return;

    const pageSnapshot = currentPage;
    const rangeSnapshot = getPageRange(pageSnapshot, document.numPages, before, after);
    const attachedSelection = selectedText.trim() || null;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();
    const historySnapshot = messages.slice(-8);

    setMessages((items) => [
      ...items,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setQuestion("");
    setSelectedText("");
    setBusy(true);
    setNotice("참고 페이지 텍스트를 준비하는 중…");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const pages = await extractPages(rangeSnapshot);
      setNotice(`${rangeSnapshot[0]}~${rangeSnapshot.at(-1)}페이지를 참고해 답변 중…`);

      await streamSse(
        "/api/chat/stream",
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
      abortRef.current = null;
      setBusy(false);
    }
  }, [after, before, busy, currentPage, document, extractPages, messages, question, selectedText]);

  return (
    <div
      className={`app-shell ${toolbarVisible ? "" : "toolbar-hidden"}`}
      style={themeVariables}
    >
      {toolbarVisible ? <Toolbar
        fileName={file?.name ?? ""}
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
        style={{ "--chat-width": `${chatWidth}px` } as CSSProperties}
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
          onTextSelection={(text) => {
            setSelectedText(text);
            setNotice("선택한 텍스트를 질문에 첨부했습니다.");
          }}
          onError={(message) => setNotice(`PDF 오류: ${message}`)}
        />
        {chatOpen && (
          <>
            <ResizeHandle width={chatWidth} onWidth={setChatWidth} />
            <ChatSidebar
              messages={messages}
              totalPages={totalPages}
              selectedText={selectedText}
              busy={busy}
              question={question}
              onQuestion={setQuestion}
              onRemoveSelection={() => setSelectedText("")}
              onSubmit={submitQuestion}
              onStop={() => abortRef.current?.abort()}
              onClear={() => setMessages([])}
              onPageClick={navigateToPage}
            />
          </>
        )}
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={setNotice}
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
