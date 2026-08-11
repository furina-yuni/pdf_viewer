import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { getPdfSelection, positionSelectionDock } from "../lib/pdfSelection";
import type { PdfTextSelection } from "../types";

type DockPosition = {
  left: number;
  top: number;
  width: number;
};

type SelectionAction =
  | ({ kind: "ready"; text: string; pageNumber: number } & DockPosition)
  | ({ kind: "invalid"; message: string } & DockPosition);

type Options = {
  rootRef: RefObject<HTMLElement | null>;
  file: File | string | null;
  scale: number;
  onSelection: (selection: PdfTextSelection) => void;
};

export function usePdfTextSelection({ rootRef, file, scale, onSelection }: Options) {
  const [action, setAction] = useState<SelectionAction | null>(null);
  const actionRef = useRef<SelectionAction | null>(null);
  const pointerDownRef = useRef(false);
  const startedInTextRef = useRef(false);
  const suppressSelectionChangeRef = useRef(false);
  const readTimerRef = useRef<number | null>(null);
  const invalidTimerRef = useRef<number | null>(null);
  const onSelectionRef = useRef(onSelection);
  onSelectionRef.current = onSelection;

  const updateAction = useCallback((next: SelectionAction | null) => {
    actionRef.current = next;
    setAction(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (readTimerRef.current !== null) {
      window.clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
    }
    if (invalidTimerRef.current !== null) {
      window.clearTimeout(invalidTimerRef.current);
      invalidTimerRef.current = null;
    }
  }, []);

  const clearSelection = useCallback((removeRange = true) => {
    clearTimers();
    updateAction(null);
    if (removeRange) window.getSelection()?.removeAllRanges();
  }, [clearTimers, updateAction]);

  const positionDock = useCallback((): DockPosition | null => {
    const root = rootRef.current;
    if (!root) return null;
    return positionSelectionDock(root.getBoundingClientRect());
  }, [rootRef]);

  const readSelection = useCallback(() => {
    const root = rootRef.current;
    const dock = positionDock();
    if (!root || !dock) return;
    const result = getPdfSelection(root, window.getSelection());
    if (result.kind === "ready") {
      updateAction({
        kind: "ready",
        text: result.selection.text,
        pageNumber: result.selection.pageNumber,
        ...dock,
      });
      return;
    }
    if (result.reason === "cross-page") {
      updateAction({ kind: "invalid", message: "한 페이지씩 선택해 주세요", ...dock });
      suppressSelectionChangeRef.current = true;
      window.getSelection()?.removeAllRanges();
      window.setTimeout(() => {
        suppressSelectionChangeRef.current = false;
      }, 0);
      if (invalidTimerRef.current !== null) window.clearTimeout(invalidTimerRef.current);
      invalidTimerRef.current = window.setTimeout(() => updateAction(null), 1_800);
      return;
    }
    updateAction(null);
  }, [positionDock, rootRef, updateAction]);

  const scheduleReadSelection = useCallback((delay = 0) => {
    if (readTimerRef.current !== null) window.clearTimeout(readTimerRef.current);
    readTimerRef.current = window.setTimeout(() => {
      readTimerRef.current = null;
      readSelection();
    }, delay);
  }, [readSelection]);

  const refreshDockPosition = useCallback(() => {
    const current = actionRef.current;
    const dock = positionDock();
    if (!current || !dock) return;
    updateAction({ ...current, ...dock });
  }, [positionDock, updateAction]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-pdf-selection-dock]")) return;
      const textLayer = target?.closest(".react-pdf__Page__textContent");
      startedInTextRef.current = Boolean(textLayer && root.contains(textLayer));
      pointerDownRef.current = startedInTextRef.current;
      updateAction(null);
      if (!startedInTextRef.current) window.getSelection()?.removeAllRanges();
    };

    const finishPointerSelection = () => {
      if (!pointerDownRef.current) return;
      pointerDownRef.current = false;
      if (startedInTextRef.current) scheduleReadSelection(0);
      startedInTextRef.current = false;
    };

    const handleSelectionChange = () => {
      if (suppressSelectionChangeRef.current || pointerDownRef.current) return;
      scheduleReadSelection(90);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.shiftKey || event.key === "Shift") scheduleReadSelection(0);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && actionRef.current) clearSelection();
    };

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!actionRef.current || target?.closest("[data-pdf-selection-dock]")) return;
      if (!root.contains(target)) clearSelection();
    };

    root.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", finishPointerSelection);
    window.addEventListener("pointercancel", finishPointerSelection);
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    window.addEventListener("resize", refreshDockPosition);
    const resizeObserver = new ResizeObserver(refreshDockPosition);
    resizeObserver.observe(root);

    return () => {
      root.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", finishPointerSelection);
      window.removeEventListener("pointercancel", finishPointerSelection);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      window.removeEventListener("resize", refreshDockPosition);
      resizeObserver.disconnect();
    };
  }, [clearSelection, file, refreshDockPosition, rootRef, scheduleReadSelection, updateAction]);

  useEffect(() => {
    pointerDownRef.current = false;
    startedInTextRef.current = false;
    clearSelection();
  }, [clearSelection, file, scale]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const attachSelection = useCallback(() => {
    const current = actionRef.current;
    if (!current || current.kind !== "ready") return;
    onSelectionRef.current({ text: current.text, pageNumber: current.pageNumber });
    clearSelection();
  }, [clearSelection]);

  return { action, attachSelection, clearSelection };
}
