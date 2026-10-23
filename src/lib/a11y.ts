import type React from "react";

/**
 * Props that make a clickable row or card usable from the keyboard: Tab reaches it, and Enter or Space opens it,
 * the same as a click. Spread onto the element next to its onClick. Add role="button" on a card (not on a table row,
 * which keeps its row meaning).
 */
export function pressable(onPress: () => void) {
  return {
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return; // a button inside the row handles its own keys
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPress();
      }
    },
  };
}
