import { useEffect, useState } from "react";
import {
  Bot,
  ChevronUp,
  FileUp,
  Maximize2,
  MessageSquare,
  Minus,
  PanelRightClose,
  Palette,
  Plus,
  Settings,
} from "lucide-react";
import { getReferenceMarkers } from "../lib/referenceMarkers";
import { snapZoomScale, stepZoomScale } from "../lib/zoom";

type Props = {
  fileName: string;
  currentPage: number;
  totalPages: number;
  scale: number;
  zoomMode: "fit" | "manual";
  chatOpen: boolean;
  before: number;
  after: number;
  contextPages: number[];
  desktopMode?: boolean;
  onFile: (file: File) => void;
  onOpenFile?: () => void;
  onScale: (scale: number) => void;
  onFit: () => void;
  onPage: (page: number) => void;
  onBefore: (value: number) => void;
  onAfter: (value: number) => void;
  onToggleChat: () => void;
  onOpenSettings: () => void;
  onOpenAppearance: () => void;
  onHide: () => void;
};

export function Toolbar(props: Props) {
  const [zoomText, setZoomText] = useState(String(Math.round(props.scale * 100)));
  const referenceMarkers = getReferenceMarkers(props.contextPages, props.currentPage);

  useEffect(() => {
    setZoomText(String(Math.round(props.scale * 100)));
  }, [props.scale]);

  function applyTypedZoom() {
    const percentage = Number(zoomText);
    if (!Number.isFinite(percentage)) {
      setZoomText(String(Math.round(props.scale * 100)));
      return;
    }
    props.onScale(snapZoomScale(percentage / 100));
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark"><Bot size={19} /></span>
        <span>Study PDF</span>
      </div>

      {props.desktopMode ? (
        <button className="tool-button file-button" onClick={props.onOpenFile}>
          <FileUp size={16} />
          PDF 열기
        </button>
      ) : (
        <label className="tool-button file-button">
          <FileUp size={16} />
          PDF 열기
          <input
            hidden
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) props.onFile(file);
              event.target.value = "";
            }}
          />
        </label>
      )}

      <span className="file-name" title={props.fileName}>
        {props.fileName || "문서를 선택하세요"}
      </span>

      <div className="toolbar-spacer" />

      {props.totalPages > 0 && (
        <>
          <div className="page-control">
            <input
              aria-label="현재 페이지"
              type="number"
              min={1}
              max={props.totalPages}
              value={props.currentPage}
              onChange={(event) => props.onPage(Number(event.target.value))}
            />
            <span>/ {props.totalPages}</span>
          </div>
          <div className="toolbar-range" aria-label="AI 참고 페이지 범위">
            <span>AI 참고</span>
            <div className="range-control">
              <span>위</span>
              <button
                type="button"
                aria-label="위 참고 페이지 줄이기"
                onClick={() => props.onBefore(Math.max(0, props.before - 1))}
                disabled={props.before <= 0}
              >
                <Minus size={13} />
              </button>
              <label>
                <span className="sr-only">위 참고 페이지</span>
                <input
                  aria-label="위 참고 페이지"
                  type="number"
                  min={0}
                  max={10}
                  value={props.before}
                  onChange={(event) => props.onBefore(clampRange(event.target.value))}
                />
              </label>
              <button
                type="button"
                aria-label="위 참고 페이지 늘리기"
                onClick={() => props.onBefore(Math.min(10, props.before + 1))}
                disabled={props.before >= 10}
              >
                <Plus size={13} />
              </button>
            </div>
            <div className="range-control">
              <span>아래</span>
              <button
                type="button"
                aria-label="아래 참고 페이지 줄이기"
                onClick={() => props.onAfter(Math.max(0, props.after - 1))}
                disabled={props.after <= 0}
              >
                <Minus size={13} />
              </button>
              <label>
                <span className="sr-only">아래 참고 페이지</span>
                <input
                  aria-label="아래 참고 페이지"
                  type="number"
                  min={0}
                  max={10}
                  value={props.after}
                  onChange={(event) => props.onAfter(clampRange(event.target.value))}
                />
              </label>
              <button
                type="button"
                aria-label="아래 참고 페이지 늘리기"
                onClick={() => props.onAfter(Math.min(10, props.after + 1))}
                disabled={props.after >= 10}
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
          <div className="reference-pages" aria-label="현재 AI 참고 페이지">
            <span>참고 페이지</span>
            <div className="toolbar-page-chips" aria-label="현재 AI 참고 페이지">
              {referenceMarkers.map((marker, index) =>
                marker === "ellipsis" ? (
                  <span className="page-ellipsis" key={`ellipsis-${index}`}>…</span>
                ) : (
                  <button
                    type="button"
                    key={marker}
                    className={marker === props.currentPage ? "active" : ""}
                    onClick={() => props.onPage(marker)}
                    title={`${marker}페이지로 이동`}
                  >
                    {marker}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="zoom-control">
            <button
              aria-label="화면에 맞춤"
              className={props.zoomMode === "fit" ? "active" : ""}
              onClick={props.onFit}
              title="PDF 높이를 화면에 맞춤"
            >
              <Maximize2 size={14} />
            </button>
            <button
              aria-label="축소"
              onClick={() => props.onScale(stepZoomScale(props.scale, -1))}
            >
              <Minus size={16} />
            </button>
            <label className="zoom-input">
              <input
                aria-label="화면 비율"
                inputMode="numeric"
                value={zoomText}
                onChange={(event) => setZoomText(event.target.value)}
                onBlur={applyTypedZoom}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applyTypedZoom();
                    event.currentTarget.blur();
                  }
                }}
              />
              <span>%</span>
            </label>
            <button
              aria-label="확대"
              onClick={() => props.onScale(stepZoomScale(props.scale, 1))}
            >
              <Plus size={16} />
            </button>
          </div>
        </>
      )}

      <button className="settings-button" onClick={props.onOpenAppearance}>
        <Palette size={16} />
        배경 설정
      </button>
      <button className="settings-button" onClick={props.onOpenSettings}>
        <Settings size={16} />
        API 설정
      </button>
      <button className="chat-toggle" onClick={props.onToggleChat}>
        {props.chatOpen ? <PanelRightClose size={17} /> : <MessageSquare size={17} />}
        {props.chatOpen ? "AI 닫기" : "AI 열기"}
      </button>
      <button
        className="toolbar-visibility-button"
        onClick={props.onHide}
        aria-label="상단 바 숨기기"
        title="상단 바 숨기기 (Shift+F)"
      >
        <ChevronUp size={17} />
      </button>
    </header>
  );
}

function clampRange(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(10, Math.max(0, number)) : 0;
}
