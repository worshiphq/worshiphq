import { useState } from "react";
import {
  Sliders, Type, Palette, AlignCenter, Sparkles,
  Monitor, ChevronDown, BarChart3, Cloud, Clock,
} from "lucide-react";
import { useProjectionStore } from "../stores/projection-store";
import type { Slide } from "../types";

export function RightPanel() {
  const { currentSlide, isLive } = useProjectionStore();
  const [activeTab, setActiveTab] = useState<"properties" | "analytics">("properties");

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-line bg-surface-2">
      {/* Tab header */}
      <div className="flex shrink-0 border-b border-line">
        {[
          { id: "properties" as const, label: "Properties", icon: Sliders },
          { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors ${
              activeTab === id
                ? "border-b-2 border-primary-bright text-primary-bright"
                : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "properties" ? (
        <PropertiesTab slide={currentSlide} isLive={isLive} />
      ) : (
        <AnalyticsTab />
      )}
    </div>
  );
}

function PropertiesTab({ slide, isLive }: { slide: Slide | null; isLive: boolean }) {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Live monitor mini preview */}
      <div className="border-b border-line p-3">
        <div className="mb-2 flex items-center gap-2">
          <Monitor className="size-3.5 text-ink-faint" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Stage Monitor</span>
          {isLive && (
            <div className="badge badge-live ml-auto">
              <div className="live-dot size-1 rounded-full bg-danger" />
              <span className="text-[8px]">LIVE</span>
            </div>
          )}
        </div>
        <div className={`monitor-frame aspect-video w-full ${isLive ? "live" : ""}`}>
          {slide ? (
            <MiniPreview slide={slide} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Monitor className="size-6 text-ink-faint/10" />
            </div>
          )}
        </div>
      </div>

      {/* Properties */}
      <div className="p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Slide Properties</span>
          <button className="rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-bright hover:bg-primary/20">
            Edit
          </button>
        </div>

        <div className="space-y-2">
          <PropGroup icon={Type} label="Text">
            <PropValue value={slide?.content.primaryText?.slice(0, 40) ?? "No text"} />
          </PropGroup>

          <PropGroup icon={Palette} label="Background">
            <div className="flex items-center gap-2">
              <div
                className="size-4 rounded-md border border-line"
                style={{ backgroundColor: typeof slide?.template.background === "string" ? slide.template.background : "#000" }}
              />
              <PropValue value={typeof slide?.template.background === "string" ? "Solid Color" : "Media"} />
            </div>
          </PropGroup>

          <PropGroup icon={AlignCenter} label="Layout">
            <PropValue value={slide?.template.textLayout === "center" ? "Centered" : slide?.template.textLayout ?? "Center"} />
          </PropGroup>

          <PropGroup icon={Type} label="Font">
            <PropValue value={slide?.template.fontFamily ?? "Open Sans, 48pt"} />
          </PropGroup>

          <PropGroup icon={Sparkles} label="Transition">
            <PropValue value="Fade — 1.0s" />
          </PropGroup>
        </div>
      </div>

      {/* Quick actions */}
      <div className="border-t border-line p-3">
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Quick Actions</span>
        <div className="grid grid-cols-2 gap-1.5">
          {["Duplicate", "Edit Text", "Background", "Transition"].map((action) => (
            <button
              key={action}
              className="btn-ghost rounded-xl px-2.5 py-2 text-[10px] font-medium"
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalyticsTab() {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="space-y-3">
        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="card rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-ink">47</div>
            <div className="text-[9px] text-ink-faint">Slides Shown</div>
          </div>
          <div className="card rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-success">1:42</div>
            <div className="text-[9px] text-ink-faint">Session Time</div>
          </div>
        </div>

        {/* Weekly chart */}
        <div className="card rounded-xl p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <BarChart3 className="size-3 text-ink-faint" />
            <span className="text-[10px] font-medium text-ink-muted">This Week</span>
          </div>
          <div className="flex h-16 items-end gap-1.5">
            {[30, 65, 45, 80, 55, 90, 40].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-gradient-to-t from-primary/20 to-primary/40"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[8px] text-ink-faint/50">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
        </div>

        {/* Cloud sync */}
        <div className="card flex items-center gap-3 rounded-xl p-3">
          <Cloud className="size-4 text-success" />
          <div className="flex-1">
            <div className="text-[11px] font-medium text-ink">Cloud Sync</div>
            <div className="text-[9px] text-ink-faint">Last synced 2 min ago</div>
          </div>
          <div className="rounded-full bg-success/10 px-2 py-0.5 text-[9px] font-bold text-success">
            SYNCED
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Recent</span>
          <div className="space-y-1.5">
            {[
              { time: "2 min", text: "Song: How Great Is Our God" },
              { time: "5 min", text: "Scripture: John 3:16" },
              { time: "12 min", text: "Media: Welcome Slide" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-surface-3 px-2.5 py-1.5">
                <Clock className="size-3 text-ink-faint" />
                <span className="flex-1 truncate text-[10px] text-ink-muted">{item.text}</span>
                <span className="text-[9px] text-ink-faint">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PropGroup({ icon: Icon, label, children }: { icon: typeof Type; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface-3 px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className="size-3 text-ink-faint" />
        <span className="text-[10px] font-medium text-ink-faint">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        {children}
        <ChevronDown className="size-3 text-ink-faint" />
      </div>
    </div>
  );
}

function PropValue({ value }: { value: string }) {
  return <span className="max-w-[120px] truncate text-[10px] text-ink-muted">{value}</span>;
}

function MiniPreview({ slide }: { slide: Slide }) {
  const bg = typeof slide.template.background === "string" ? slide.template.background : "#000";
  return (
    <div className="flex h-full w-full items-center justify-center p-3" style={{ backgroundColor: bg }}>
      {slide.type === "logo" ? (
        <span className="text-xs font-bold text-white/30">WHQ</span>
      ) : (
        <div className="text-center">
          <p className="line-clamp-3 text-[8px] font-medium leading-snug text-white/80">
            {slide.content.primaryText}
          </p>
          {slide.content.secondaryText && (
            <p className="mt-0.5 text-[6px] text-white/40">{slide.content.secondaryText}</p>
          )}
        </div>
      )}
    </div>
  );
}
