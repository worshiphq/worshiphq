import { Music, BookOpen, Image, Globe, Mic, Settings, Presentation } from "lucide-react";

export type NavSection = "songs" | "scriptures" | "media" | "presentations" | "web" | "audio" | "settings";

const NAV_ITEMS: { id: NavSection; icon: typeof Music; label: string }[] = [
  { id: "songs", icon: Music, label: "Songs" },
  { id: "scriptures", icon: BookOpen, label: "Scriptures" },
  { id: "media", icon: Image, label: "Media" },
  { id: "presentations", icon: Presentation, label: "Presentations" },
  { id: "web", icon: Globe, label: "Web" },
];

export function IconNav({
  active,
  onChange,
}: {
  active: NavSection;
  onChange: (section: NavSection) => void;
}) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-0.5 border-r border-line bg-surface-2 pt-3 pb-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            title={item.label}
            className={`group relative flex size-10 flex-col items-center justify-center gap-0.5 rounded-xl transition-all ${
              isActive
                ? "bg-primary/15 text-primary-bright"
                : "text-ink-faint hover:bg-surface-4 hover:text-ink-muted"
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary-bright" />
            )}
            <Icon className="size-[18px]" />
            <span className="text-[8px] font-medium leading-none">{item.label}</span>
          </button>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-0.5">
        <button
          onClick={() => onChange("audio")}
          title="Audio"
          className={`flex size-10 flex-col items-center justify-center gap-0.5 rounded-xl transition-all ${
            active === "audio"
              ? "bg-primary/15 text-primary-bright"
              : "text-ink-faint hover:bg-surface-4 hover:text-ink-muted"
          }`}
        >
          <Mic className="size-[18px]" />
          <span className="text-[8px] font-medium leading-none">Audio</span>
        </button>
        <button
          onClick={() => onChange("settings")}
          title="Settings"
          className={`flex size-10 flex-col items-center justify-center gap-0.5 rounded-xl transition-all ${
            active === "settings"
              ? "bg-primary/15 text-primary-bright"
              : "text-ink-faint hover:bg-surface-4 hover:text-ink-muted"
          }`}
        >
          <Settings className="size-[18px]" />
          <span className="text-[8px] font-medium leading-none">Settings</span>
        </button>
      </div>
    </div>
  );
}
