import { render, waitFor } from "@testing-library/react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfViewer } from "./PdfViewer";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: { workerSrc: "" } },
  Document: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Page: ({ pageNumber }: { pageNumber: number }) => (
    <canvas data-testid="rendered-pdf-page" data-page={pageNumber} />
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
});
