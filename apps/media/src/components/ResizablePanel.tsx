import { useState, useCallback, useRef, useEffect } from "react";

interface ResizablePanelProps {
  direction: "horizontal" | "vertical";
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  children: React.ReactNode;
  className?: string;
  resizerPosition?: "end" | "start";
}

export function ResizablePanel({
  direction,
  initialSize,
  minSize = 100,
  maxSize = 800,
  children,
  className = "",
  resizerPosition = "end",
}: ResizablePanelProps) {
  const [size, setSize] = useState(initialSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;
      startSize.current = size;
      document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction, size],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const pos = direction === "horizontal" ? e.clientX : e.clientY;
      const diff = resizerPosition === "end" ? pos - startPos.current : startPos.current - pos;
      const newSize = Math.max(minSize, Math.min(maxSize, startSize.current + diff));
      setSize(newSize);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [direction, minSize, maxSize, resizerPosition]);

  const style =
    direction === "horizontal" ? { width: size, minWidth: minSize } : { height: size, minHeight: minSize };

  const resizerClass =
    direction === "horizontal"
      ? "absolute top-0 bottom-0 w-[5px] cursor-col-resize z-10 hover:bg-primary/20 transition-colors"
      : "absolute left-0 right-0 h-[5px] cursor-row-resize z-10 hover:bg-primary/20 transition-colors";

  const resizerPos =
    direction === "horizontal"
      ? resizerPosition === "end"
        ? "right-0"
        : "left-0"
      : resizerPosition === "end"
        ? "bottom-0"
        : "top-0";

  return (
    <div ref={containerRef} className={`relative shrink-0 ${className}`} style={style}>
      {children}
      <div className={`${resizerClass} ${resizerPos}`} onMouseDown={onMouseDown} />
    </div>
  );
}
