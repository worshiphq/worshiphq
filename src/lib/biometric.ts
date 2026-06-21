export const DEFAULT_AGENT_PORT = 23847;
export const DEFAULT_AGENT_URL = `http://localhost:${DEFAULT_AGENT_PORT}`;

export const FINGER_OPTIONS = [
  { value: "right_thumb", label: "Right thumb" },
  { value: "right_index", label: "Right index" },
  { value: "right_middle", label: "Right middle" },
  { value: "right_ring", label: "Right ring" },
  { value: "right_pinky", label: "Right pinky" },
  { value: "left_thumb", label: "Left thumb" },
  { value: "left_index", label: "Left index" },
  { value: "left_middle", label: "Left middle" },
  { value: "left_ring", label: "Left ring" },
  { value: "left_pinky", label: "Left pinky" },
] as const;

export type FingerKey = (typeof FINGER_OPTIONS)[number]["value"];
