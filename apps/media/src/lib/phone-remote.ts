import { create } from "zustand";
import { isDesktopApp } from "./media-src";
import { plainText } from "./rich-text";
import { useProjectionStore } from "../stores/projection-store";
import { useShowStore } from "../stores/show-store";

/** The phone remote: a page on the church Wi-Fi, opened with a PIN (Settings › Keyboard shortcuts). */
interface PhoneState { on: boolean; url: string | null; pin: string; error: string | null; setOn: (v: boolean) => Promise<void>; newPin: () => Promise<void> }
const KEY = "whq-phone-remote";
const makePin = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));

function saved(): { on: boolean; pin: string } {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? "{}"); if (/^\d{6}$/.test(s.pin)) return { on: !!s.on, pin: s.pin }; } catch { /* ignore */ }
  return { on: false, pin: makePin() };
}
const first = saved();
const keep = (on: boolean, pin: string) => { try { localStorage.setItem(KEY, JSON.stringify({ on, pin })); } catch { /* ignore */ } };
const call = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => (await import("@tauri-apps/api/core")).invoke<T>(cmd, args);

export const usePhoneRemote = create<PhoneState>((set, get) => ({
  on: false,
  url: null,
  pin: first.pin,
  error: null,
  setOn: async (on) => {
    if (!isDesktopApp()) { set({ error: "The phone remote works in the installed app." }); return; }
    keep(on, get().pin);
    if (!on) { await call("phone_stop").catch(() => {}); set({ on: false, url: null, error: null }); return; }
    try {
      push();
      set({ on: true, url: await call<string>("phone_start", { pin: get().pin }), error: null });
    } catch (e) {
      set({ on: false, url: null, error: String(e) });
    }
  },
  newPin: async () => {
    const pin = makePin();
    set({ pin });
    keep(get().on, pin);
    if (get().on) await get().setOn(true);
  },
}));

const KIND: Record<string, string> = { song: "Song", scripture: "Bible", media: "Picture or video", announcement: "Announcement", custom: "Slide" };
let timer = 0;
let sent = "";
function push() {
  if (!isDesktopApp()) return;
  const { live } = useShowStore.getState();
  const p = useProjectionStore.getState();
  const json = JSON.stringify({
    title: live?.title ?? "",
    index: live?.index ?? -1,
    slides: (live?.slides ?? []).slice(0, 300).map((s) => ({ l: s.label ?? "", t: s.media ? (s.media.kind === "video" ? "Video" : "Picture") : plainText(s.content.primaryText ?? "").slice(0, 400) })),
    items: p.serviceItems.map((i) => ({ t: i.title, k: KIND[i.type] ?? "" })),
    black: p.isBlack,
    cleared: p.textCleared,
    logo: p.isLive && p.currentSlide?.type === "logo",
  });
  if (json === sent) return;
  sent = json;
  call("phone_state", { json }).catch(() => {});
}
const soon = () => { if (timer || !usePhoneRemote.getState().on) return; timer = window.setTimeout(() => { timer = 0; push(); }, 150); };

/** Keeps the phones up to date; starts again by itself if it was on last time. */
export function startPhoneRemote(): () => void {
  const a = useShowStore.subscribe(soon), b = useProjectionStore.subscribe(soon);
  if (isDesktopApp() && first.on) usePhoneRemote.getState().setOn(true);
  return () => { a(); b(); };
}
