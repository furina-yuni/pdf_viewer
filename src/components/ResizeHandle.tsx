import { useEffect, useRef, useState } from "react";

type Props = {
  ratio: number;
  onRatio: (ratio: number) => void;
};

export function ResizeHandle({ ratio, onRatio }: Props) {
  const [dragging, setDragging] = useState(false);
  const bounds = useRef({ left: 0, right: 0, width: 0 });

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const { left, right, width } = bounds.current;
      const minimum = Math.min(280 / width, 0.5);
      const maximum = Math.max(minimum, (right - left - 7) / width);
      onRatio(Math.min(maximum, Math.max(minimum, (right - event.clientX) / width)));
    };
    const stop = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [dragging, onRatio]);

  return (
    <div
      className={`resize-handle ${dragging ? "dragging" : ""}`}
      role="separator"
      aria-label="AI 창 너비 조절"
      aria-orientation="vertical"
      aria-valuenow={Math.round(ratio * 100)}
      onPointerDown={(event) => {
        const workspace = event.currentTarget.parentElement?.getBoundingClientRect();
        if (!workspace || workspace.width <= 0) return;
        bounds.current = { left: workspace.left, right: workspace.right, width: workspace.width };
        setDragging(true);
      }}
    >
      <span />
    </div>
  );
}
