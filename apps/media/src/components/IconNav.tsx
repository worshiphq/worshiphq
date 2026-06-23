import { Music, BookOpen, Image, Globe, Mic, Settings } from "lucide-react";

export type NavSection = "songs" | "scriptures" | "media" | "web" | "audio" | "settings";

const NAV_ITEMS: { id: NavSection; icon: typeof Music; label: string }[] = [
  { id: "songs", icon: Music, label: "Songs" },
  { id: "scriptures", icon: BookOpen, label: "Scriptures" },
  { id: "media", icon: Image, label: "Media" },
  { id: "web", icon: Globe, label: "Web" },
  { id: "audio", icon: Mic, label: "Audio" },
];

export function IconNav({
  active,
  onChange,
}: {
  active: NavSection;
  onChange: (section: NavSection) => void;
}) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface-2 py-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            title={item.label}
            className={`group relative grid size-9 place-items-center rounded-lg transition-all ${
              isActive
                ? "bg-primary/15 text-primary-bright"
                : "text-ink-faint hover:bg-surface-4 hover:text-ink-muted"
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-primary-bright" />
            )}
            <Icon className="size-4" />
          </button>
        );
      })}

      <div className="mt-auto">
        <button
          onClick={() => onChange("settings")}
          title="Settings"
          className={`grid size-9 place-items-center rounded-lg transition-all ${
            active === "settings"
              ? "bg-primary/15 text-primary-bright"
              : "text-ink-faint hover:bg-surface-4 hover:text-ink-muted"
          }`}
        >
          <Settings className="size-4" />
        </button>
      </div>
    </div>
  );
}
