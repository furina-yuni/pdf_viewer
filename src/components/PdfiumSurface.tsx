import { useCallback, useEffect, useMemo, useState } from "react";
import { Quote } from "lucide-react";
import { createPluginRegistration, type PluginRegistry } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import {
  DocumentContent,
  DocumentManagerPluginPackage,
  type DocumentManagerPlugin,
} from "@embedpdf/plugin-document-manager/react";
import { PagePointerProvider, InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";
import { RenderLayer, RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { Scroller, ScrollPluginPackage, type ScrollPlugin } from "@embedpdf/plugin-scroll/react";
import {
  SelectionLayer,
  SelectionPluginPackage,
  useSelectionCapability,
  type SelectionSelectionMenuProps,
} from "@embedpdf/plugin-selection/react";
import { Viewport, ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ZoomMode, ZoomPluginPackage, type ZoomPlugin } from "@embedpdf/plugin-zoom/react";
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import { createPdfiumTextSelection } from "../lib/pdfiumSelection";
import type { PdfTextSelection } from "../types";

const DOCUMENT_ID = "study-pdf-document";

type Props = {
  file: File | string;
  navigationRequest: { page: number; sequence: number } | null;
  scale: number;
  autoFit: boolean;
  onScale: (scale: number) => void;
  onCurrentPage: (page: number) => void;
  onTextSelection: (selection: PdfTextSelection) => void;
  onError: (message: string) => void;
};

export function PdfiumSurface(props: Props) {
  const source = usePdfiumSource(props.file);
  const { engine, isLoading, error } = usePdfiumEngine({
    wasmUrl: pdfiumWasmUrl,
    worker: false,
    fontFallback: null,
  });

  useEffect(() => {
    if (error) props.onError(`PDFium 엔진을 시작하지 못했습니다: ${error.message}`);
  }, [error, props.onError]);

  if (isLoading || !engine || !source) {
    return <div className="loading pdfium-loading">PDFium 뷰어 불러오는 중…</div>;
  }

  return (
    <PdfiumDocument
      {...props}
      source={source}
      engine={engine}
    />
  );
}

type PdfiumDocumentProps = Props & {
  source: PdfiumSource;
  engine: NonNullable<ReturnType<typeof usePdfiumEngine>["engine"]>;
};

function PdfiumDocument({
  source,
  engine,
  navigationRequest,
  scale,
  autoFit,
  onScale,
  onCurrentPage,
  onTextSelection,
  onError,
}: PdfiumDocumentProps) {
  const [registry, setRegistry] = useState<PluginRegistry | null>(null);
  // PDFium's zoom plugin gates the viewport until its first responsive zoom has
  // been calculated. A numeric default never releases that gate before the
  // viewport has dimensions, so bootstrap responsively and restore a saved
  // manual scale immediately afterwards.
  const [initialZoom] = useState(() => autoFit ? ZoomMode.FitPage : ZoomMode.Automatic);
  const plugins = useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [{
          ...source,
          documentId: DOCUMENT_ID,
          name: "Study PDF",
          autoActivate: true,
        }],
        maxDocuments: 1,
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage, {
        defaultPageGap: 22,
        defaultBufferSize: 2,
      }),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SelectionPluginPackage, {
        toleranceFactor: 0.75,
        minSelectionDragDistance: 1,
        maxCachedGeometries: 12,
        menuHeight: 40,
      }),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: initialZoom,
        minZoom: 0.25,
        maxZoom: 4,
        zoomStep: 0.05,
      }),
    ],
    [initialZoom, source],
  );

  const handleInitialized = useCallback(async (nextRegistry: PluginRegistry) => {
    setRegistry(nextRegistry);
    const documentManager = nextRegistry
      .getPlugin<DocumentManagerPlugin>("document-manager")
      ?.provides();
    documentManager?.onDocumentError((event) => onError(event.message));
  }, [onError]);

  useEffect(() => {
    if (!registry) return;
    const scroll = registry.getPlugin<ScrollPlugin>("scroll")?.provides();
    const zoom = registry.getPlugin<ZoomPlugin>("zoom")?.provides();
    const stopPage = scroll?.onPageChange((event) => {
      if (event.documentId === DOCUMENT_ID) onCurrentPage(event.pageNumber);
    });
    const stopZoom = zoom?.onStateChange((event) => {
      if (
        event.documentId === DOCUMENT_ID &&
        (autoFit || event.state.zoomLevel !== ZoomMode.Automatic)
      ) {
        onScale(event.state.currentZoomLevel);
      }
    });
    return () => {
      stopPage?.();
      stopZoom?.();
    };
  }, [autoFit, onCurrentPage, onScale, registry]);

  useEffect(() => {
    if (!registry) return;
    const zoom = registry.getPlugin<ZoomPlugin>("zoom")?.provides();
    if (!zoom) return;
    const scope = zoom.forDocument(DOCUMENT_ID);
    const requestedZoom = autoFit ? ZoomMode.FitPage : scale;
    scope.requestZoom(requestedZoom);
    const stopBootstrap = zoom.onZoomChange((event) => {
      if (
        event.documentId === DOCUMENT_ID &&
        !autoFit &&
        event.level === ZoomMode.Automatic
      ) {
        scope.requestZoom(scale);
      }
    });
    return stopBootstrap;
  }, [autoFit, registry, scale]);

  useEffect(() => {
    if (!registry || !navigationRequest) return;
    registry
      .getPlugin<ScrollPlugin>("scroll")
      ?.provides()
      .forDocument(DOCUMENT_ID)
      .scrollToPage({ pageNumber: navigationRequest.page, behavior: "instant", alignY: 0 });
  }, [navigationRequest, registry]);

  return (
    <EmbedPDF engine={engine} plugins={plugins} onInitialized={handleInitialized}>
      {({ activeDocumentId }) => activeDocumentId && (
        <DocumentContent documentId={activeDocumentId}>
          {({ documentState, isLoading, isError, isLoaded }) => (
            <>
              {isLoading && <div className="loading pdfium-loading">PDF 불러오는 중…</div>}
              {isError && (
                <div className="loading pdfium-error">
                  PDF를 표시하지 못했습니다{documentState.error ? `: ${documentState.error}` : "."}
                </div>
              )}
              {isLoaded && (
                <Viewport documentId={activeDocumentId} className="pdfium-viewport">
                  <Scroller
                    documentId={activeDocumentId}
                    className="pdfium-scroller"
                    renderPage={({ pageIndex, width, height }) => (
                      <PagePointerProvider
                        documentId={activeDocumentId}
                        pageIndex={pageIndex}
                        className="pdfium-page"
                        style={{ width, height, position: "relative" }}
                      >
                        <RenderLayer
                          documentId={activeDocumentId}
                          pageIndex={pageIndex}
                          dpr={Math.min(window.devicePixelRatio || 1, 1.5)}
                          className="pdfium-render-layer"
                        />
                        <SelectionLayer
                          documentId={activeDocumentId}
                          pageIndex={pageIndex}
                          background="rgba(66, 133, 244, 0.42)"
                          selectionMenu={(menuProps) => (
                            <SelectionQuoteMenu
                              {...menuProps}
                              documentId={activeDocumentId}
                              onTextSelection={onTextSelection}
                            />
                          )}
                        />
                      </PagePointerProvider>
                    )}
                  />
                </Viewport>
              )}
            </>
          )}
        </DocumentContent>
      )}
    </EmbedPDF>
  );
}

type SelectionQuoteMenuProps = SelectionSelectionMenuProps & {
  documentId: string;
  onTextSelection: (selection: PdfTextSelection) => void;
};

function SelectionQuoteMenu({
  documentId,
  onTextSelection,
  menuWrapperProps,
  placement,
  rect,
  context,
}: SelectionQuoteMenuProps) {
  const { provides } = useSelectionCapability();

  const attach = useCallback(async () => {
    const scope = provides?.forDocument(documentId);
    if (!scope) return;
    const lines = await scope.getSelectedText().toPromise();
    const formatted = scope.getFormattedSelection();
    const selection = createPdfiumTextSelection(lines, formatted, context.pageIndex);
    if (selection) onTextSelection(selection);
    scope.clear();
  }, [context.pageIndex, documentId, onTextSelection, provides]);

  const top = placement.suggestTop ? -44 : rect.size.height + 8;
  return (
    <div {...menuWrapperProps}>
      <button
        type="button"
        className="pdfium-selection-quote"
        style={{ top }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={() => void attach()}
      >
        <Quote size={14} />
        인용 추가
      </button>
    </div>
  );
}

type PdfiumSource =
  | { url: string; mode: "range-request" }
  | { buffer: ArrayBuffer; name: string };

function usePdfiumSource(file: File | string): PdfiumSource | null {
  const [source, setSource] = useState<PdfiumSource | null>(
    typeof file === "string" ? { url: file, mode: "range-request" } : null,
  );

  useEffect(() => {
    if (typeof file === "string") {
      setSource({ url: file, mode: "range-request" });
      return;
    }
    let cancelled = false;
    void file.arrayBuffer().then((buffer) => {
      if (!cancelled) setSource({ buffer, name: file.name });
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  return source;
}
