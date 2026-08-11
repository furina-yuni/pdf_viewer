import { fireEvent, render, waitFor } from "@testing-library/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfViewer } from "./PdfViewer";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: { workerSrc: "" } },
  Document: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Page: ({ pageNumber }: { pageNumber: number }) => (
    <>
      <canvas data-testid="rendered-pdf-page" data-page={pageNumber} />
      <div className="react-pdf__Page__textContent">
        <span>Page {pageNumber} selectable text</span>
      </div>
    </>
  ),
}));

class TestIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("PdfViewer virtualization", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    vi.stubGlobal("ResizeObserver", TestIntersectionObserver);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it("keeps 500 page shells but renders at most five canvas pages", async () => {
    const document = { numPages: 500 } as PDFDocumentProxy;
    const props = {
      file: "study-pdf://document/test",
      document,
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
    const { container, rerender } = render(<PdfViewer {...props} />);

    expect(container.querySelectorAll("[data-page]")).toHaveLength(500 + 3);
    expect(container.querySelectorAll("canvas")).toHaveLength(3);

    rerender(
      <PdfViewer
        {...props}
        navigationRequest={{ page: 250, sequence: 1 }}
      />,
    );

    await waitFor(() => expect(container.querySelectorAll("canvas")).toHaveLength(5));
    expect(
      [...container.querySelectorAll("canvas")].map((canvas) => canvas.dataset.page),
    ).toEqual(["248", "249", "250", "251", "252"]);
  });

  it("adds a same-page selection with its page number and clears the native range", async () => {
    const onTextSelection = vi.fn();
    const props = createProps(onTextSelection);
    const { container } = render(<PdfViewer {...props} />);
    const textLayer = container.querySelector("[data-page='1'] .react-pdf__Page__textContent span")!;
    const textNode = textLayer.firstChild!;
    const removeAllRanges = vi.fn();
    const selection = createSelection(textNode, textNode, "selected text", removeAllRanges);
    vi.spyOn(window, "getSelection").mockReturnValue(selection);

    fireEvent.pointerDown(textLayer, { clientY: 100 });
    fireEvent.pointerUp(window, { clientY: 100 });

    const button = await waitFor(() => {
      const element = document.querySelector<HTMLButtonElement>(".selection-dock-attach");
      expect(element).not.toBeNull();
      return element!;
    });
    fireEvent.pointerDown(button);
    fireEvent.click(button);

    expect(onTextSelection).toHaveBeenCalledWith({ text: "selected text", pageNumber: 1 });
    expect(removeAllRanges).toHaveBeenCalled();
  });

  it("rejects a selection that crosses PDF pages", async () => {
    const props = createProps(vi.fn());
    const { container } = render(<PdfViewer {...props} />);
    const first = container.querySelector("[data-page='1'] .react-pdf__Page__textContent span")!;
    const second = container.querySelector("[data-page='2'] .react-pdf__Page__textContent span")!;
    const selection = createSelection(first.firstChild!, second.firstChild!, "two pages", vi.fn());
    vi.spyOn(window, "getSelection").mockReturnValue(selection);

    fireEvent.pointerDown(first, { clientY: 100 });
    fireEvent.pointerUp(window, { clientY: 140 });

    await waitFor(() => {
      expect(document.querySelector(".selection-dock-invalid")?.textContent).toContain(
        "한 페이지씩 선택해 주세요",
      );
    });
    expect(props.onTextSelection).not.toHaveBeenCalled();
  });

  it("dismisses the active selection with Escape", async () => {
    const props = createProps(vi.fn());
    const { container } = render(<PdfViewer {...props} />);
    const textLayer = container.querySelector("[data-page='1'] .react-pdf__Page__textContent span")!;
    const removeAllRanges = vi.fn();
    vi.spyOn(window, "getSelection").mockReturnValue(
      createSelection(textLayer.firstChild!, textLayer.firstChild!, "selected text", removeAllRanges),
    );

    fireEvent.pointerDown(textLayer, { clientY: 100 });
    fireEvent.pointerUp(window, { clientY: 100 });
    await waitFor(() => expect(document.querySelector(".selection-dock-attach")).not.toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(document.querySelector(".selection-dock")).toBeNull());
    expect(removeAllRanges).toHaveBeenCalled();
  });

  it("registers citation selection after opening a PDF from the empty screen", async () => {
    const onTextSelection = vi.fn();
    const loadedProps = createProps(onTextSelection);
    const { container, rerender } = render(
      <PdfViewer
        {...loadedProps}
        file={null}
        document={null}
        totalPages={0}
      />,
    );

    rerender(<PdfViewer {...loadedProps} />);
    const textLayer = container.querySelector("[data-page='1'] .react-pdf__Page__textContent span")!;
    vi.spyOn(window, "getSelection").mockReturnValue(
      createSelection(textLayer.firstChild!, textLayer.firstChild!, "restored citation", vi.fn()),
    );

    fireEvent.pointerDown(textLayer, { clientY: 100 });
    fireEvent.pointerUp(window, { clientY: 100 });

    const citationButton = await waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>(".selection-dock-attach");
      expect(button).not.toBeNull();
      return button!;
    });
    expect(citationButton).toHaveTextContent("인용 추가");
    fireEvent.click(citationButton);
    expect(onTextSelection).toHaveBeenCalledWith({ text: "restored citation", pageNumber: 1 });
  });
});

function createProps(onTextSelection: ReturnType<typeof vi.fn>) {
  return {
    file: "study-pdf://document/test",
    document: { numPages: 3 } as PDFDocumentProxy,
    totalPages: 3,
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
    onTextSelection,
    onError: vi.fn(),
  };
}

function createSelection(
  anchorNode: Node,
  focusNode: Node,
  text: string,
  removeAllRanges: () => void,
): Selection {
  const selectionRect = {
    left: 120,
    right: 220,
    top: 100,
    bottom: 118,
    width: 100,
    height: 18,
  } as DOMRect;
  const range = {
    getClientRects: () => [selectionRect],
    getBoundingClientRect: () => selectionRect,
  } as unknown as Range;
  return {
    anchorNode,
    focusNode,
    anchorOffset: 0,
    focusOffset: text.length,
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => range,
    toString: () => text,
    removeAllRanges,
  } as unknown as Selection;
}
