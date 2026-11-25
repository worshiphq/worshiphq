import { useProjectionStore } from "../stores/projection-store";
import { useShowStore } from "../stores/show-store";
import { useAudioStore } from "../stores/audio-store";
import { useVoiceStore } from "../stores/voice-store";
import { useExtrasStore } from "../stores/extras-store";

/**
 * Buttons that outside controllers can press: a Stream Deck (through Bitfocus Companion:
 * "HTTP request" to http://127.0.0.1:18300/action/<name>), a MIDI pad or keyboard, or a presentation clicker.
 */
export const REMOTE_ACTIONS: { id: string; label: string }[] = [
  { id: "next", label: "Next slide" },
  { id: "previous", label: "Previous slide" },
  { id: "send", label: "Send Preview live" },
  { id: "black", label: "Black screen (on/off)" },
  { id: "clear", label: "Clear the words (on/off)" },
  { id: "logo", label: "Church logo (on/off)" },
  { id: "next-item", label: "Next item in the schedule" },
  { id: "ticker-off", label: "Stop the ticker" },
  { id: "props-off", label: "Take props off" },
  { id: "music-pause", label: "Music play / pause" },
  { id: "music-fade", label: "Fade the music out" },
  { id: "voice", label: "Voice assistant on/off" },
];

export function runRemoteAction(id: string) {
  const proj = useProjectionStore.getState();
  const show = useShowStore.getState();
  // From the phone: one slide of what is live, or one item of the schedule.
  const pick = id.match(/^(go|item)-(\d{1,4})$/);
  if (pick) {
    const i = +pick[2];
    if (pick[1] === "go") { if (show.live && i < show.live.slides.length) show.liveGo(i); return; }
    const it = proj.serviceItems[i];
    if (it?.slides?.length) { proj.setActiveItem(i); show.setPreview(it.title, it.slides, 0, it.data?.songId); show.sendPreviewLive(0); }
    return;
  }
  switch (id) {
    case "next": show.liveStep(1); break;
    case "previous": show.liveStep(-1); break;
    case "send": show.sendPreviewLive(); break;
    case "black": proj.toggleBlack(); break;
    case "clear": proj.toggleClearText(); break;
    case "logo": proj.toggleLogo(); break;
    case "next-item": {
      const from = proj.activeItemIndex;
      const i = proj.serviceItems.findIndex((it, k) => k > from && it.slides?.length);
      if (i >= 0) { proj.setActiveItem(i); show.setPreview(proj.serviceItems[i].title, proj.serviceItems[i].slides!, 0, proj.serviceItems[i].data?.songId); show.sendPreviewLive(0); }
      break;
    }
    case "ticker-off": useExtrasStore.getState().setTicker({ on: false }); break;
    case "props-off": useExtrasStore.getState().setProp({ on: false }); break;
    case "music-pause": useAudioStore.getState().toggle(); break;
    case "music-fade": useAudioStore.getState().fadeOut(); break;
    case "voice": { const v = useVoiceStore.getState(); if (v.status === "listening" || v.status === "starting") v.stop(); else v.start(); break; }
  }
}

/* ───────────── MIDI ───────────── */

const MIDI_KEY = "whq-midi-map";
type MidiMap = Record<string, string>; // "note:60" / "cc:21" → action id

export function readMidiMap(): MidiMap {
  try { return JSON.parse(localStorage.getItem(MIDI_KEY) ?? "{}"); } catch { return {}; }
}
export function saveMidiMap(map: MidiMap) {
  try { localStorage.setItem(MIDI_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

let learning: ((key: string) => void) | null = null;
/** The next MIDI button pressed is reported here (to link it to an action). */
export function learnMidi(cb: ((key: string) => void) | null) { learning = cb; }

let started = false;
/** Listens to every MIDI controller plugged in (pads, keyboards, foot switches). */
export async function startMidi(): Promise<string[]> {
  const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> };
  if (!nav.requestMIDIAccess) return [];
  try {
    const access = await nav.requestMIDIAccess();
    const names: string[] = [];
    const hook = () => {
      names.length = 0;
      access.inputs.forEach((input) => {
        names.push(input.name ?? "MIDI device");
        input.onmidimessage = (e: MIDIMessageEvent) => {
          const d = e.data;
          if (!d || d.length < 3) return;
          const type = d[0] & 0xf0;
          // Note on (velocity > 0) or a control change going up.
          const key = type === 0x90 && d[2] > 0 ? `note:${d[1]}` : type === 0xb0 && d[2] > 63 ? `cc:${d[1]}` : null;
          if (!key) return;
          if (learning) { const cb = learning; learning = null; cb(key); return; }
          const action = readMidiMap()[key];
          if (action) runRemoteAction(action);
        };
      });
    };
    hook();
    if (!started) { access.onstatechange = hook; started = true; }
    return [...names];
  } catch {
    return [];
  }
}
