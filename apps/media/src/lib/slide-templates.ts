import type { Slide } from "../types";

export interface SlideTemplate {
  id: string;
  name: string;
  category: "scripture" | "lyrics" | "title" | "announcement" | "lower-third" | "blank";
  background: string;
  textLayout: Slide["template"]["textLayout"];
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  textShadow: string;
  thumbnail?: string;
}

export const DEFAULT_TEMPLATES: SlideTemplate[] = [
  {
    id: "classic-dark",
    name: "Classic Dark",
    category: "scripture",
    background: "#000000",
    textLayout: "center",
    fontFamily: "'Georgia', serif",
    fontSize: 56,
    fontColor: "#ffffff",
    textShadow: "0 4px 20px rgba(0,0,0,0.8)",
  },
  {
    id: "modern-gradient",
    name: "Modern Gradient",
    category: "lyrics",
    background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
    textLayout: "center",
    fontFamily: "system-ui, sans-serif",
    fontSize: 52,
    fontColor: "#ffffff",
    textShadow: "0 2px 12px rgba(0,0,0,0.5)",
  },
  {
    id: "warm-earth",
    name: "Warm Earth",
    category: "scripture",
    background: "linear-gradient(180deg, #1a0a00, #2d1810, #1a0a00)",
    textLayout: "bottom",
    fontFamily: "'Palatino Linotype', serif",
    fontSize: 48,
    fontColor: "#f5e6d0",
    textShadow: "0 3px 15px rgba(0,0,0,0.7)",
  },
  {
    id: "clean-white",
    name: "Clean White",
    category: "announcement",
    background: "#f8f8f8",
    textLayout: "center",
    fontFamily: "system-ui, sans-serif",
    fontSize: 44,
    fontColor: "#1a1a1a",
    textShadow: "none",
  },
  {
    id: "midnight-blue",
    name: "Midnight Blue",
    category: "lyrics",
    background: "linear-gradient(180deg, #000428, #004e92)",
    textLayout: "center",
    fontFamily: "'Segoe UI', sans-serif",
    fontSize: 54,
    fontColor: "#ffffff",
    textShadow: "0 2px 16px rgba(0,50,150,0.5)",
  },
  {
    id: "lower-third-dark",
    name: "Lower Third",
    category: "lower-third",
    background: "transparent",
    textLayout: "lower-third",
    fontFamily: "system-ui, sans-serif",
    fontSize: 36,
    fontColor: "#ffffff",
    textShadow: "0 2px 8px rgba(0,0,0,0.8)",
  },
  {
    id: "sunrise-gold",
    name: "Sunrise Gold",
    category: "title",
    background: "linear-gradient(135deg, #0c0c1d, #1a1a2e, #16213e)",
    textLayout: "center",
    fontFamily: "'Georgia', serif",
    fontSize: 64,
    fontColor: "#f5c842",
    textShadow: "0 4px 20px rgba(245,200,66,0.3)",
  },
  {
    id: "forest-green",
    name: "Forest Green",
    category: "scripture",
    background: "linear-gradient(180deg, #0a1a0a, #1a3a1a, #0a1a0a)",
    textLayout: "center",
    fontFamily: "'Palatino Linotype', serif",
    fontSize: 50,
    fontColor: "#d4e8d4",
    textShadow: "0 3px 15px rgba(0,0,0,0.7)",
  },
];

export function applyTemplate(template: SlideTemplate, content: Slide["content"]): Slide {
  return {
    type: template.category === "scripture"
      ? "scripture"
      : template.category === "lyrics"
        ? "song"
        : template.category === "lower-third"
          ? "custom"
          : "announcement",
    content,
    template: {
      background: template.background,
      textLayout: template.textLayout,
      fontFamily: template.fontFamily,
      fontSize: template.fontSize,
      fontColor: template.fontColor,
      textShadow: template.textShadow,
    },
  };
}
