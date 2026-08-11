import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock3, FileText, FolderOpen, LoaderCircle, Quote, X } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { usePdfTextSelection } from "../hooks/usePdfTextSelection";
import { getHeightFitScale } from "../lib/pdfScale";
import { getRenderWindow } from "../lib/pageWindow";
import type { PdfTextSelection } from "../types";
import type { RecentPdf } from "../electron";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Props = {
  file: File | string | null;
  document: PDFDocumentProxy | null;
  totalPages: number;
  navigationRequest: { page: number; sequence: number } | null;
  scale: number;
  autoFit: boolean;
  recentPdfs: RecentPdf[];
  recentError: string;
  onOpenFile: () => void;
  onOpenRecent: (filePath: string) => void;
  onLoad: (document: PDFDocumentProxy) => void;
  onScale: (scale: number) => void;
  onCurrentPage: (page: number) => void;
  onTextSelection: (selection: PdfTextSelection) => void;
  onError: (message: string) => void;
};

export function PdfViewer(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { action: selectionAction, attachSelection, clearSelection } = usePdfTextSelection({
    rootRef: containerRef,
    file: props.file,
    scale: props.scale,
    onSelection: props.onTextSelection,
  });
  const navigationTargetRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const currentPageRef = useRef(1);
  const [renderCenter, setRenderCenter] = useState(1);
  const [defaultPageSize, setDefaultPageSize] = useState({ width: 595, height: 842 });
  const [pageSizes, setPageSizes] = useState<Map<number, { width: number; height: number }>>(
    () => new Map(),
  );
  const pages = useMemo(
    () => Array.from({ length: props.totalPages }, (_, index) => index + 1),
    [props.totalPages],
  );
  const renderedPages = useMemo(
    () => new Set(getRenderWindow(renderCenter, props.totalPages)),
    [renderCenter, props.totalPages],
  );

  useEffect(() => {
    currentPageRef.current = 1;
    setRenderCenter(1);
    setDefaultPageSize({ width: 595, height: 842 });
    setPageSizes(new Map());
  }, [props.file]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !props.totalPages) return;

    const visibility = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) visibility.set(page, entry.intersectionRatio);
          else visibility.delete(page);
        }
        let mostVisible: [number, number] | null = null;
        for (const candidate of visibility) {
          if (!mostVisible || candidate[1] > mostVisible[1]) mostVisible = candidate;
        }
        if (!mostVisible) return;

        const navigationTarget = navigationTargetRef.current;
        if (navigationTarget !== null && mostVisible[0] !== navigationTarget) return;
        if (navigationTarget === mostVisible[0]) {
          navigationTargetRef.current = null;
          if (navigationTimerRef.current !== null) {
            window.clearTimeout(navigationTimerRef.current);
            navigationTimerRef.current = null;
          }
        }
        currentPageRef.current = mostVisible[0];
        setRenderCenter(mostVisible[0]);
        props.onCurrentPage(mostVisible[0]);
      },
      { root, threshold: [0, 0.15, 0.3, 0.5, 0.7, 0.9] },
    );

    root.querySelectorAll("[data-page]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [props.totalPages, props.scale, props.onCurrentPage]);

  useEffect(() => {
    const request = props.navigationRequest;
    if (!request || !props.document) return;
    const root = containerRef.current;
    if (!root) return;
    navigationTargetRef.current = request.page;
    currentPageRef.current = request.page;
    setRenderCenter(request.page);

    void nextPaint().then(() => {
      root
        .querySelector(`[data-page="${request.page}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    if (navigationTimerRef.current !== null) {
      window.clearTimeout(navigationTimerRef.current);
    }
    navigationTimerRef.current = window.setTimeout(() => {
      navigationTargetRef.current = null;
      navigationTimerRef.current = null;
    }, 1_200);
  }, [props.navigationRequest, props.document]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !props.document || !props.autoFit) return;
    let cancelled = false;
    let resizeTimer: number | null = null;

    const fitCurrentPage = async () => {
      const pageNumber = currentPageRef.current;
      const page = await props.document!.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      if (cancelled || root.clientHeight <= 0) return;
      props.onScale(getHeightFitScale(root.clientHeight, viewport.height));
      await nextPaint();
      if (!cancelled) {
        root
          .querySelector(`[data-page="${pageNumber}"]`)
          ?.scrollIntoView({ behavior: "auto", block: "center" });
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => void fitCurrentPage(), 60);
    });
    resizeObserver.observe(root);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    };
  }, [props.autoFit, props.document, props.onScale]);

  useEffect(
    () => () => {
      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
      }
    },
    [],
  );

  if (!props.file) {
    return (
      <main className="viewer-empty">
        <div className="empty-content">
          <div className="empty-icon"><FileText size={30} /></div>
          <h1>PDF를 열고, 필요한 페이지만 AI와 공부하세요</h1>
          <p>현재 페이지 주변의 범위만 문맥으로 보내므로 빠르고 토큰을 아낄 수 있습니다.</p>
          {window.desktop?.isElectron && (
            <>
              <button className="empty-open-button" onClick={props.onOpenFile}>
                <FolderOpen size={17} />
                PDF 열기
              </button>
              <section className="recent-documents" aria-label="최근 문서">
                <div className="recent-title">
                  <Clock3 size={15} />
                  <strong>최근 문서</strong>
                </div>
                {props.recentPdfs.length > 0 ? (
                  <div className="recent-list">
                    {props.recentPdfs.map((recent) => (
                      <button
                        type="button"
                        key={recent.path}
                        onClick={() => props.onOpenRecent(recent.path)}
                        title={recent.path}
                      >
                        <FileText size={17} />
                        <span>
                          <strong>{recent.name}</strong>
                          <small>{recent.path}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="recent-empty">아직 열어 본 PDF가 없습니다.</div>
                )}
                {props.recentError && <div className="recent-error">{props.recentError}</div>}
              </section>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="viewer-scroll" ref={containerRef}>
      {selectionAction && (
        createPortal(
          <div
            className={`selection-dock ${selectionAction.kind === "invalid" ? "selection-dock-invalid" : ""}`}
            data-pdf-selection-dock
            style={{
              left: selectionAction.left,
              top: selectionAction.top,
              width: selectionAction.width,
            }}
            role={selectionAction.kind === "ready" ? "toolbar" : "status"}
            aria-label={selectionAction.kind === "ready" ? "선택 텍스트 작업" : undefined}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {selectionAction.kind === "ready" ? (
              <>
                <div className="selection-dock-mark"><Quote size={17} /></div>
                <div className="selection-dock-content">
                  <strong>{selectionAction.pageNumber}페이지에서 선택</strong>
                  <p title={selectionAction.text}>{selectionAction.text}</p>
                </div>
                <button
                  type="button"
                  className="selection-dock-cancel"
                  aria-label="선택 취소"
                  onClick={() => clearSelection()}
                >
                  <X size={15} />
                </button>
                <button type="button" className="selection-dock-attach" onClick={attachSelection}>
                  <Quote size={15} />
                  인용 추가
                </button>
              </>
            ) : (
              <>
                <div className="selection-dock-mark"><Quote size={17} /></div>
                <strong>{selectionAction.message}</strong>
              </>
            )}
          </div>,
          document.body,
        )
      )}
      <Document
        file={props.file}
        onLoadSuccess={props.onLoad}
        onLoadError={(error) => props.onError(error.message)}
        loading={<div className="loading"><LoaderCircle className="spin" /> PDF 불러오는 중…</div>}
      >
        {props.document &&
          pages.map((page) => {
            const pageSize = pageSizes.get(page) ?? defaultPageSize;
            const width = pageSize.width * props.scale;
            const height = pageSize.height * props.scale;
            return (
              <section
                key={page}
                className="pdf-page-shell"
                data-page={page}
                style={{ width, height }}
              >
                <div className="page-number">{page}</div>
                {renderedPages.has(page) ? (
                  <Page
                    pageNumber={page}
                    scale={props.scale}
                    devicePixelRatio={Math.min(window.devicePixelRatio || 1, 1.5)}
                    renderAnnotationLayer
                    renderTextLayer
                    onLoadSuccess={(loadedPage: PDFPageProxy) => {
                      const viewport = loadedPage.getViewport({ scale: 1 });
                      const nextSize = { width: viewport.width, height: viewport.height };
                      if (page === 1) setDefaultPageSize(nextSize);
                      setPageSizes((sizes) => {
                        const previous = sizes.get(page);
                        if (
                          previous &&
                          previous.width === nextSize.width &&
                          previous.height === nextSize.height
                        ) {
                          return sizes;
                        }
                        const next = new Map(sizes);
                        next.set(page, nextSize);
                        return next;
                      });
                    }}
                    loading={<div className="page-placeholder">페이지 {page} 렌더링 중…</div>}
                  />
                ) : (
                  <div className="page-placeholder" aria-label={`${page}페이지 대기`} />
                )}
              </section>
            );
          })}
      </Document>
    </main>
  );
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}
