import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { saveCcliReport } from "../lib/ccli";
import { openBackupFile } from "../lib/backup";
import { deleteTemplate, listTemplates, saveAsTemplate, startFromTemplate } from "../lib/templates";
import { createProfile, currentProfile, deleteProfile, listProfiles, switchProfile } from "../lib/profiles";

/** One menu entry. `shortcut` is only shown. A divider has no label. */
export interface MenuEntry {
  label?: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  divider?: boolean;
}

export type MenuAction =
  | "schedule:new" | "schedule:open" | "schedule:save" | "schedule:plan" | "schedule:first" | "schedule:clear"
  | "song:new" | "song:edit" | "song:import-ew" | "song:import-files" | "songs"
  | "bible" | "bible:versions" | "media" | "media:add" | "media:presentation" | "media:free" | "media:design"
  | "voice" | "live" | "live:projector" | "live:black" | "live:clear" | "live:logo" | "live:send" | "live:tools" | "live:obs"
  | "view:preview" | "settings" | "settings:looks" | "settings:screens" | "settings:audio" | "settings:shortcuts" | "settings:about" | "settings:backup"
  | "help:website" | "help:updates" | "help:account" | "exit";

/**
 * The menu bar, laid out like EasyWorship's (File, View, Schedule, Songs, Bible, Media, Live, Profiles, Help),
 * so people moving from EasyWorship find everything where they expect it.
 */
export function MenuBar({ onAction, previewShown, projectorOn }: { onAction: (a: MenuAction) => void; previewShown: boolean; projectorOn: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [, refresh] = useState(0);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [open]);

  const a = (action: MenuAction) => () => onAction(action);
  const profile = currentProfile();

  const MENUS: Record<string, MenuEntry[]> = {
    File: [
      { label: "New schedule", shortcut: "Ctrl+N", onClick: a("schedule:new") },
      { label: "Open schedule…", shortcut: "Ctrl+O", onClick: a("schedule:open") },
      { label: "Save schedule as…", shortcut: "Ctrl+S", onClick: a("schedule:save") },
      { divider: true },
      { label: "Import songs from EasyWorship…", onClick: a("song:import-ew") },
      { label: "Import PowerPoint or PDF…", onClick: a("media:presentation") },
      { label: "Add pictures, videos or audio…", onClick: a("media:add") },
      { divider: true },
      { label: "Back up…", onClick: a("settings:backup") },
      { label: "Restore from a backup…", onClick: () => openBackupFile() },
      { divider: true },
      { label: "Settings", onClick: a("settings") },
      { divider: true },
      { label: "Exit", shortcut: "Alt+F4", onClick: a("exit") },
    ],
    View: [
      { label: "Preview and Live screens", checked: previewShown, onClick: a("view:preview") },
      { divider: true },
      { label: "Bible", shortcut: "Ctrl+3", onClick: a("bible") },
      { label: "Songs", shortcut: "Ctrl+4", onClick: a("songs") },
      { label: "Media", shortcut: "Ctrl+5", onClick: a("media") },
      { label: "Voice assistant", shortcut: "Ctrl+6", onClick: a("voice") },
      { label: "Live tools (countdown, alerts, stage)", shortcut: "Ctrl+2", onClick: a("live:tools") },
    ],
    Schedule: [
      { label: "Plan the service…", shortcut: "Ctrl+1", onClick: a("schedule:plan") },
      { label: "Show the first item", onClick: a("schedule:first") },
      { divider: true },
      { label: "New schedule", onClick: a("schedule:new") },
      { label: "Open schedule…", onClick: a("schedule:open") },
      { label: "Save schedule as…", onClick: a("schedule:save") },
      { divider: true },
      { label: "Save as a template…", onClick: () => { saveAsTemplate(); refresh((n) => n + 1); } },
      ...listTemplates().map((t) => ({ label: `New from “${t}”`, onClick: () => startFromTemplate(t) })),
      ...(listTemplates().length ? [{ label: "Delete a template…", onClick: () => {
        const name = window.prompt(`Which template should be deleted? (${listTemplates().join(", ")})`, "");
        if (name && listTemplates().includes(name.trim())) { deleteTemplate(name.trim()); refresh((n) => n + 1); }
      } }] : []),
      { divider: true },
      { label: "Clear the schedule", onClick: a("schedule:clear") },
    ],
    Songs: [
      { label: "New song…", onClick: a("song:new") },
      { label: "Edit the selected song…", onClick: a("song:edit") },
      { divider: true },
      { label: "Import from EasyWorship 6 or 7…", onClick: a("song:import-ew") },
      { label: "Import song text files…", onClick: a("song:import-files") },
      { divider: true },
      { label: "CCLI song report…", onClick: () => saveCcliReport() },
      { divider: true },
      { label: "Song library", onClick: a("songs") },
    ],
    Bible: [
      { label: "Open the Bible", onClick: a("bible") },
      { label: "Bible versions…", onClick: a("bible:versions") },
    ],
    Media: [
      { label: "Pictures, videos and audio", onClick: a("media") },
      { label: "Free backgrounds", onClick: a("media:free") },
      { label: "Design a slide…", onClick: a("media:design") },
      { label: "Add pictures, videos or audio…", onClick: a("media:add") },
      { label: "Import PowerPoint or PDF…", onClick: a("media:presentation") },
    ],
    Live: [
      { label: "Send Preview live", shortcut: "Enter", onClick: a("live:send") },
      { divider: true },
      { label: "Black screen", shortcut: "Ctrl+B", onClick: a("live:black") },
      { label: "Clear the words", shortcut: "Ctrl+C", onClick: a("live:clear") },
      { label: "Church logo", shortcut: "Ctrl+L", onClick: a("live:logo") },
      { divider: true },
      { label: projectorOn ? "Close the projector screen" : "Open the projector screen", onClick: a("live:projector") },
      { label: "Countdown, alerts and stage display", onClick: a("live:tools") },
      { label: "Livestream words window (OBS)…", onClick: a("live:obs") },
      { label: "Screens and stage display settings…", onClick: a("settings:screens") },
    ],
    Profiles: [
      ...listProfiles().map((p) => ({ label: p, checked: p === profile, onClick: () => switchProfile(p) })),
      { divider: true },
      {
        label: "New profile…",
        onClick: () => {
          const name = window.prompt("Name for the new profile (it starts with the settings you have now):", "");
          if (name?.trim()) { createProfile(name); refresh((n) => n + 1); }
        },
      },
      {
        label: `Delete “${profile}”`,
        disabled: profile === "Default",
        onClick: () => { if (window.confirm(`Delete the profile “${profile}”?`)) deleteProfile(profile); },
      },
      { divider: true },
      { label: "Look & fonts…", onClick: a("settings:looks") },
    ],
    Help: [
      { label: "Keyboard shortcuts", onClick: a("settings:shortcuts") },
      { label: "Voice commands", onClick: a("settings:audio") },
      { label: "WorshipHQ website and help", onClick: a("help:website") },
      { divider: true },
      { label: "Check for updates…", onClick: a("help:updates") },
      { label: "WorshipHQ account…", onClick: a("help:account") },
      { label: "About WorshipHQ Live", onClick: a("settings:about") },
    ],
  };

  return (
    <div ref={ref} className="flex items-center" role="menubar">
      {Object.entries(MENUS).map(([name, entries]) => (
        <div key={name} className="relative">
          <button
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={open === name}
            onClick={() => setOpen(open === name ? null : name)}
            onMouseEnter={() => open && setOpen(name)}
            className={`rounded px-2.5 py-1 text-[13px] ${open === name ? "bg-primary-soft text-primary-bright" : "text-ink hover:bg-surface-4"}`}
          >
            {name}
          </button>
          {open === name && (
            <div role="menu" className="absolute left-0 top-full z-[70] mt-0.5 min-w-[250px] rounded-lg border border-line-bright bg-surface-2 py-1 shadow-[0_12px_32px_rgba(15,23,42,0.2)]">
              {entries.map((e, i) =>
                e.divider ? (
                  <div key={i} className="my-1 h-px bg-line" />
                ) : (
                  <button
                    key={i}
                    role="menuitem"
                    disabled={e.disabled}
                    onClick={() => { setOpen(null); e.onClick?.(); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink hover:bg-primary-soft disabled:opacity-40"
                  >
                    <span className="w-4 shrink-0">{e.checked && <Check className="size-4 text-primary-bright" />}</span>
                    <span className="flex-1">{e.label}</span>
                    {e.shortcut && <span className="text-[11px] text-ink-faint">{e.shortcut}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
