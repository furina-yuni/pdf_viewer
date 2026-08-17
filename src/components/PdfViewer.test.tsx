import { cleanup, fireEvent, render } from "@testing-library/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdfViewer } from "./PdfViewer";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: { workerSrc: "" } },
  Document: ({ onLoadSuccess }: { onLoadSuccess: (document: PDFDocumentProxy) => void }) => (
    <button
      type="button"
      data-testid="metadata-loader"
      onClick={() => onLoadSuccess({ numPages: 3 } as PDFDocumentProxy)}
    />
  ),
}));

vi.mock("./PdfiumSurface", () => ({
  PdfiumSurface: (props: {
    navigationRequest: { page: number; sequence: number } | null;
    scale: number;
    autoFit: boolean;
    onTextSelection: (selection: { text: string; pageNumber: number }) => void;
  }) => (
    <button
      type="button"
      data-testid="pdfium-surface"
      data-navigation={props.navigationRequest?.page ?? ""}
      data-scale={props.scale}
      data-auto-fit={String(props.autoFit)}
      onClick={() => props.onTextSelection({ text: "PDFium selection", pageNumber: 2 })}
    >
      PDFium viewer
    </button>
  ),
}));

afterEach(cleanup);

describe("PdfViewer PDFium integration", () => {
  it("uses one virtualized PDFium surface instead of creating a page DOM tree", () => {
    const { container, getByTestId } = render(<PdfViewer {...createProps()} />);

    expect(getByTestId("pdfium-surface")).toBeInTheDocument();
    expect(container.querySelectorAll("canvas")).toHaveLength(0);
    expect(container.querySelectorAll(".pdf-page-shell")).toHaveLength(0);
  });

  it("forwards navigation, zoom, and fit settings to PDFium", () => {
    const { getByTestId } = render(
      <PdfViewer
        {...createProps()}
        navigationRequest={{ page: 250, sequence: 1 }}
        scale={1.25}
        autoFit
      />,
    );
    const surface = getByTestId("pdfium-surface");
    expect(surface).toHaveAttribute("data-navigation", "250");
    expect(surface).toHaveAttribute("data-scale", "1.25");
    expect(surface).toHaveAttribute("data-auto-fit", "true");
  });

  it("forwards the glyph selection and page number to the citation flow", () => {
    const onTextSelection = vi.fn();
    const { getByTestId } = render(
      <PdfViewer {...createProps()} onTextSelection={onTextSelection} />,
    );

    fireEvent.click(getByTestId("pdfium-surface"));
    expect(onTextSelection).toHaveBeenCalledWith({ text: "PDFium selection", pageNumber: 2 });
  });

  it("retains the hidden PDF.js metadata loader for RAG and page extraction", () => {
    const onLoad = vi.fn();
    const { getByTestId } = render(<PdfViewer {...createProps()} onLoad={onLoad} />);

    fireEvent.click(getByTestId("metadata-loader"));
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ numPages: 3 }));
  });

  it("mounts the selection-capable surface after opening from the empty screen", () => {
    const props = createProps();
    const { queryByTestId, rerender } = render(<PdfViewer {...props} file={null} />);
    expect(queryByTestId("pdfium-surface")).toBeNull();

    rerender(<PdfViewer {...props} />);
    expect(queryByTestId("pdfium-surface")).toBeInTheDocument();
  });
});

function createProps() {
  return {
    file: "study-pdf://document/test",
    document: { numPages: 500 } as PDFDocumentProxy,
    totalPages: 500,
    navigationRequest: null,
    scale: 1,
    autoFit: false,
    recentPdfs: [],
    recentError: "",
    onOpenFile: vi.fn(),
    onOpenRecent: vi.fn(),
    onLoad: vi.fn(),
    onScale: vi.fn(),
    onCurrentPage: vi.fn(),
    onTextSelection: vi.fn(),
    onError: vi.fn(),
  };
}
