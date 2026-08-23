// Client-safe weekday helpers. Index matches localParts().weekday (0=Sun..6=Sat).
export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Monday-first options for pickers; value is the 0=Sun..6=Sat index.
export const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((v) => ({ value: v, label: WEEKDAY_LABELS[v] }));

export const weekdayLabel = (v: number) => WEEKDAY_LABELS[v] ?? "";
