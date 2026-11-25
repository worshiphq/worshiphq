import { ask, askText, tell } from "../components/Dialogs";
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

export async function saveAsTemplate() {
  const p = useProjectionStore.getState();
  if (!p.serviceItems.length) { await tell("The schedule is empty. Add songs, verses or pictures first."); return; }
  const name = (await askText("Start later schedules from this one.", p.serviceName, { title: "Save as a template", placeholder: "Name", yes: "Save" }))?.trim().slice(0, 40);
  if (!name) return;
  const all = read();
  if (all[name] && !(await ask(`Replace the template “${name}”?`, "Replace"))) return;
  all[name] = { items: p.serviceItems, name: p.serviceName, startTime: p.startTime };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { tell("Couldn't save the template (not enough space)."); }
}

export async function startFromTemplate(name: string) {
  const t = read()[name];
  if (!t) return;
  const p = useProjectionStore.getState();
  if (p.serviceItems.length && !(await ask(`Start a new schedule from “${name}”? The schedule you have now will be replaced.`, "Start"))) return;
  p.newService();
  for (const it of t.items) p.addToService({ ...it, id: crypto.randomUUID() });
  p.setServiceDetails({ serviceName: t.name || name, startTime: t.startTime || p.startTime });
}

export function deleteTemplate(name: string) {
  const all = read();
  delete all[name];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
}
