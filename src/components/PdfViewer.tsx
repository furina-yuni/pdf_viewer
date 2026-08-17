import { Clock3, FileText, FolderOpen } from "lucide-react";
import { Document, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfiumSurface } from "./PdfiumSurface";
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

  const viewerKey = typeof props.file === "string"
    ? props.file
    : `${props.file.name}:${props.file.size}:${props.file.lastModified}`;

  return (
    <main className="viewer-scroll viewer-pdfium">
      <div className="pdf-metadata-loader" aria-hidden="true">
        <Document
          file={props.file}
          onLoadSuccess={props.onLoad}
          onLoadError={(error) => props.onError(error.message)}
          loading={null}
        />
      </div>
      <PdfiumSurface
        key={viewerKey}
        file={props.file}
        navigationRequest={props.navigationRequest}
        scale={props.scale}
        autoFit={props.autoFit}
        onScale={props.onScale}
        onCurrentPage={props.onCurrentPage}
        onTextSelection={props.onTextSelection}
        onError={props.onError}
      />
    </main>
  );
}
