import { useEffect, useRef, useState } from "react";

type Props = {
  width: number;
  onWidth: (width: number) => void;
};

export function ResizeHandle({ width, onWidth }: Props) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, width });

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const next = start.current.width + (start.current.x - event.clientX);
      onWidth(Math.min(getMaximumWidth(), Math.max(320, next)));
    };
    const stop = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [dragging, onWidth]);

  return (
    <div
      className={`resize-handle ${dragging ? "dragging" : ""}`}
      role="separator"
      aria-label="AI 창 너비 조절"
      aria-orientation="vertical"
      onPointerDown={(event) => {
        start.current = { x: event.clientX, width: Math.min(width, getMaximumWidth()) };
        setDragging(true);
      }}
    >
      <span />
    </div>
  );
}

function getMaximumWidth(): number {
  return Math.max(320, window.innerWidth - 7);
}
