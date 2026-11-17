/**
 * The one list of asset categories, statuses and conditions. The page, the form, the action and the
 * export all read from here, so the lists can never drift apart again.
 * Category keys stay lowercase (as stored since the first version); labels are for people.
 */

export const ASSET_CATEGORIES = [
  { key: "general", label: "General" },
  { key: "audio-visual", label: "Sound and screens" },
  { key: "musical", label: "Musical instruments" },
  { key: "furniture", label: "Furniture" },
  { key: "vehicle", label: "Vehicles" },
  { key: "IT", label: "Computers and IT" },
  { key: "kitchen", label: "Kitchen" },
  { key: "other", label: "Other" },
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]["key"];
export const CATEGORY_KEYS: string[] = ASSET_CATEGORIES.map((c) => c.key);
export const categoryLabel = (key: string) => ASSET_CATEGORIES.find((c) => c.key === key)?.label ?? key;

export const ASSET_STATUSES = [
  { key: "in-service", label: "In service", tone: "success" },
  { key: "checked-out", label: "Out with someone", tone: "info" },
  { key: "in-repair", label: "In repair", tone: "warning" },
  { key: "in-storage", label: "In storage", tone: "muted" },
  { key: "disposed", label: "Disposed", tone: "muted" },
  { key: "lost", label: "Lost", tone: "danger" },
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number]["key"];
export const STATUS_KEYS: string[] = ASSET_STATUSES.map((s) => s.key);
export const statusMeta = (key: string) => ASSET_STATUSES.find((s) => s.key === key) ?? ASSET_STATUSES[0];

export const ASSET_CONDITIONS = [
  { key: "new", label: "New", tone: "success" },
  { key: "good", label: "Good", tone: "success" },
  { key: "fair", label: "Fair", tone: "warning" },
  { key: "poor", label: "Poor", tone: "danger" },
  { key: "decommissioned", label: "Out of use", tone: "muted" },
] as const;

export const CONDITION_KEYS: string[] = ASSET_CONDITIONS.map((c) => c.key);
export const conditionMeta = (key: string) => ASSET_CONDITIONS.find((c) => c.key === key) ?? ASSET_CONDITIONS[1];

export const DISPOSAL_METHODS = [
  { key: "sold", label: "Sold" },
  { key: "donated", label: "Given away" },
  { key: "scrapped", label: "Scrapped" },
  { key: "lost", label: "Lost" },
  { key: "stolen", label: "Stolen" },
] as const;
export const DISPOSAL_KEYS: string[] = DISPOSAL_METHODS.map((d) => d.key);

export const DOCUMENT_KINDS = [
  { key: "insurance", label: "Insurance" },
  { key: "roadworthy", label: "Roadworthy" },
  { key: "registration", label: "Registration (DVLA)" },
  { key: "receipt", label: "Receipt or invoice" },
  { key: "warranty", label: "Warranty" },
  { key: "manual", label: "Manual" },
  { key: "photo", label: "Photo" },
  { key: "other", label: "Other" },
] as const;
export const DOCUMENT_KIND_KEYS: string[] = DOCUMENT_KINDS.map((d) => d.key);

/** Expense categories offered first. Expense categories are Title Case; any other text is still allowed. */
export const EXPENSE_CATEGORIES = ["General", "Utilities", "Rent", "Transport", "Maintenance", "Supplies", "Salaries", "Missions", "Welfare", "Events", "Instruments", "Honorarium", "Levies & remittances"];

export const PAYMENT_METHODS = [
  { key: "cash", label: "Cash" },
  { key: "momo", label: "MoMo" },
  { key: "bank", label: "Bank" },
  { key: "cheque", label: "Cheque" },
  { key: "card", label: "Card" },
] as const;
export const PAYMENT_METHOD_KEYS: string[] = PAYMENT_METHODS.map((m) => m.key);
export const methodLabel = (key: string | null | undefined) => (key ? PAYMENT_METHODS.find((m) => m.key === key)?.label ?? key : "Not recorded");
