import { useEffect } from "react";

export interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      for (const shortcut of shortcuts) {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey : !e.ctrlKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.alt ? e.altKey : !e.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);
}

export const DEFAULT_SHORTCUTS: Omit<Shortcut, "action">[] = [
  { key: " ", description: "Go Live / Next slide" },
  { key: "Escape", description: "Go Black" },
  { key: "l", ctrl: true, description: "Toggle Logo" },
  { key: "c", ctrl: true, shift: true, description: "Clear projection" },
  { key: "ArrowRight", description: "Next slide in sequence" },
  { key: "ArrowLeft", description: "Previous slide in sequence" },
  { key: "ArrowDown", description: "Next service item" },
  { key: "ArrowUp", description: "Previous service item" },
  { key: "b", ctrl: true, description: "Open Bible search" },
  { key: "s", ctrl: true, description: "Open Song search" },
  { key: "t", ctrl: true, description: "Start/stop timer" },
  { key: "f", description: "Toggle fullscreen", alt: true },
];
