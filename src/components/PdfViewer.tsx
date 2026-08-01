import { useEffect, useMemo, useRef } from "react";
import { Clock3, FileText, FolderOpen, LoaderCircle } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getHeightFitScale } from "../lib/pdfScale";
import type { RecentPdf } from "../electron";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Props = {
  file: File | null;
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
  onTextSelection: (text: string) => void;
  onError: (message: string) => void;
};

export function PdfViewer(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigationTargetRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const currentPageRef = useRef(1);
  const pages = useMemo(
    () => Array.from({ length: props.totalPages }, (_, index) => index + 1),
    [props.totalPages],
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !props.totalPages) return;

    const visibility = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          visibility.set(page, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        const mostVisible = [...visibility.entries()].sort((a, b) => b[1] - a[1])[0];
        if (!mostVisible || mostVisible[1] <= 0) return;

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

    const target = root.querySelector(`[data-page="${request.page}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });

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
    <main
      className="viewer-scroll"
      ref={containerRef}
      onMouseUp={() => {
        const root = containerRef.current;
        const selection = window.getSelection();
        if (
          !root ||
          !selection ||
          selection.isCollapsed ||
          !selection.anchorNode ||
          !root.contains(selection.anchorNode)
        ) {
          return;
        }
        const text = selection.toString().replace(/\s+/g, " ").trim();
        if (text) props.onTextSelection(text.slice(0, 20_000));
      }}
    >
      <Document
        file={props.file}
        onLoadSuccess={props.onLoad}
        onLoadError={(error) => props.onError(error.message)}
        loading={<div className="loading"><LoaderCircle className="spin" /> PDF 불러오는 중…</div>}
      >
        {props.document &&
          pages.map((page) => (
            <section key={page} className="pdf-page-shell" data-page={page}>
              <div className="page-number">{page}</div>
              <Page
                pageNumber={page}
                scale={props.scale}
                renderAnnotationLayer
                renderTextLayer
                loading={<div className="page-placeholder">페이지 {page} 렌더링 중…</div>}
              />
            </section>
          ))}
      </Document>
    </main>
  );
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}
