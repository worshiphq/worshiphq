import { useProjectionStore } from "../stores/projection-store";
import type { ServiceItem } from "../types";

/** Saved schedules to start from ("Sunday morning", "Wednesday Bible study"). Kept on this computer. */
const KEY = "whq-schedule-templates";

type Templates = Record<string, { items: ServiceItem[]; name: string; startTime: string }>;

function read(): Templates {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Templates; } catch { return {}; }
}

export function listTemplates(): string[] {
  return Object.keys(read()).sort((a, b) => a.localeCompare(b));
}

export function saveAsTemplate() {
  const p = useProjectionStore.getState();
  if (!p.serviceItems.length) { window.alert("The schedule is empty. Add songs, verses or pictures first."); return; }
  const name = window.prompt("Name for this template (e.g. Sunday morning):", p.serviceName)?.trim().slice(0, 40);
  if (!name) return;
  const all = read();
  if (all[name] && !window.confirm(`Replace the template “${name}”?`)) return;
  all[name] = { items: p.serviceItems, name: p.serviceName, startTime: p.startTime };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { window.alert("Couldn't save the template (not enough space)."); }
}

export function startFromTemplate(name: string) {
  const t = read()[name];
  if (!t) return;
  const p = useProjectionStore.getState();
  if (p.serviceItems.length && !window.confirm(`Start a new schedule from “${name}”? The schedule you have now will be replaced.`)) return;
  p.newService();
  for (const it of t.items) p.addToService({ ...it, id: crypto.randomUUID() });
  p.setServiceDetails({ serviceName: t.name || name, startTime: t.startTime || p.startTime });
}

export function deleteTemplate(name: string) {
  const all = read();
  delete all[name];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
}
