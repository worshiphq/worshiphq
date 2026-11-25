import { ask, tell } from "../components/Dialogs";
import { useProjectionStore } from "../stores/projection-store";
import type { ServiceItem } from "../types";

/** Schedules can be saved to a file and opened again (or on another computer), like EasyWorship schedules. */
interface ScheduleFile {
  app: "WorshipHQ Live" | "WorshipHQ Media";
  version: 1;
  name: string;
  date: string;
  startTime: string;
  items: ServiceItem[];
}

const isDesktop = () => !!(window as any).__TAURI_INTERNALS__;

export async function saveSchedule(): Promise<void> {
  if (!isDesktop()) return;
  const p = useProjectionStore.getState();
  const { save } = await import("@tauri-apps/plugin-dialog");
  const safe = `${p.serviceName} ${p.serviceDate}`.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Schedule";
  const path = await save({ title: "Save the schedule", defaultPath: `${safe}.whqschedule`, filters: [{ name: "WorshipHQ schedule", extensions: ["whqschedule"] }] });
  if (!path) return;
  const file: ScheduleFile = { app: "WorshipHQ Live", version: 1, name: p.serviceName, date: p.serviceDate, startTime: p.startTime, items: p.serviceItems };
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_text_file", { path, text: JSON.stringify(file, null, 1) }).catch((e) => tell(String(e)));
}

export async function openSchedule(): Promise<void> {
  if (!isDesktop()) return;
  const p = useProjectionStore.getState();
  if (p.serviceItems.length && !(await ask("Open another schedule? The one you have now will be replaced (save it first if you need it).", "Open"))) return;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ title: "Open a schedule", multiple: false, filters: [{ name: "WorshipHQ schedule", extensions: ["whqschedule", "json"] }] });
  if (!picked) return;
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    const [f] = await invoke<{ name: string; text: string }[]>("read_text_files", { paths: [String(picked)] });
    const data = JSON.parse(f.text) as ScheduleFile;
    if (!Array.isArray(data.items)) throw new Error("That file isn't a WorshipHQ schedule.");
    p.newService();
    for (const it of data.items) p.addToService(it);
    p.setServiceDetails({ serviceName: data.name || p.serviceName, serviceDate: data.date || p.serviceDate, startTime: data.startTime || p.startTime });
  } catch (e) {
    tell(`Couldn't open that schedule: ${e instanceof Error ? e.message : e}`);
  }
}
