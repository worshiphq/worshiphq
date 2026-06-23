import { useProjectionStore } from "../stores/projection-store";

export function Toolbar() {
  const {
    isLive, isBlack, projectionOpen,
    goLive, goBlack, goLogo, goClear,
    openProjection, closeProjection, currentSlide,
  } = useProjectionStore();

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-line bg-surface-2/80 px-3 py-1">
      <ToolBtn label="New" />
      <ToolBtn label="Open" />
      <ToolBtn label="Save" />
      <div className="mx-1.5 h-4 w-px bg-line" />
      <ToolBtn label="Schedule" />
      <ToolBtn label="Presenter" />
      <ToolBtn label="Web" />
      <div className="mx-1.5 h-4 w-px bg-line" />

      <button className="flex items-center gap-1 rounded-md border border-line bg-surface-4 px-2.5 py-1 text-[10px] text-ink-muted transition-colors hover:border-line-bright hover:bg-surface-5">
        Background
        <span className="text-[8px] text-ink-faint">▼</span>
      </button>

      <div className="flex-1" />

      <button
        onClick={() => projectionOpen ? closeProjection() : openProjection()}
        className={`rounded-md border px-2.5 py-1 text-[10px] font-medium transition-colors ${
          projectionOpen
            ? "border-success/40 bg-success/10 text-success"
            : "border-line bg-surface-4 text-ink-muted hover:border-line-bright hover:bg-surface-5"
        }`}
      >
        {projectionOpen ? "Output On" : "Open Output"}
      </button>

      <div className="mx-1.5 h-4 w-px bg-line" />

      <ToolBtn
        label="None"
        onClick={goClear}
      />
      <ToolBtn
        label="Logo"
        onClick={goLogo}
      />
      <ToolBtn
        label="Black"
        active={isBlack}
        onClick={goBlack}
      />

      <button
        onClick={() => {
          if (isLive) goClear();
          else if (currentSlide) goLive(currentSlide);
        }}
        className={`ml-1 rounded-md px-3.5 py-1 text-[10px] font-bold transition-all ${
          isLive
            ? "bg-danger text-white shadow-sm shadow-danger/20"
            : "bg-gradient-to-r from-success to-green-600 text-white shadow-sm shadow-success/20 hover:shadow-md hover:shadow-success/30"
        }`}
      >
        {isLive ? "Stop" : "Go Live"}
      </button>
    </div>
  );
}

function ToolBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[10px] transition-colors ${
        active
          ? "bg-ink text-surface font-semibold"
          : "text-ink-muted hover:bg-surface-4 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
