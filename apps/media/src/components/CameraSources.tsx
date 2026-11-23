import { useEffect, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";
import type { Slide } from "../types";
import { useShowStore } from "../stores/show-store";
import { CameraFeed } from "./SlideCanvas";

/** The cameras and capture cards on this computer (asks Windows once so their names show). */
export function useCameras() {
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    try {
      let list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      if (list.length && !list[0].label) {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        s.getTracks().forEach((t) => t.stop());
        list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      }
      setCams(list);
      setError(list.length ? null : "No camera or capture card found. Plug one in, then press Look again.");
    } catch {
      setError("Windows didn't let WorshipHQ use the camera. Check Settings › Privacy › Camera.");
    }
  }
  useEffect(() => { load(); }, []);
  return { cams, error, reload: load };
}

export function cameraSlide(cam: MediaDeviceInfo): Slide {
  return {
    type: "media",
    label: cam.label || "Camera",
    content: { primaryText: "" },
    template: { background: "#000", textLayout: "center" },
    media: { kind: "camera", src: "", deviceId: cam.deviceId, fit: "cover" },
  };
}

/** Media › Camera: show a camera full screen (click = Preview, double-click = live). */
export function CameraSources() {
  const { cams, error, reload } = useCameras();
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-3 flex items-center gap-2">
        <Camera className="size-4 text-primary-bright" />
        <span className="flex-1 text-[14px] text-ink">Cameras and capture cards. Use one full screen here, or behind the words with the <b>Background</b> button.</span>
        <button onClick={reload} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold text-primary-bright hover:bg-primary-soft"><RefreshCw className="size-3.5" /> Look again</button>
      </div>
      {error && <p className="mb-3 rounded-lg bg-surface-4 px-3 py-2 text-[13px] text-ink">{error}</p>}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {cams.map((c) => (
          <button key={c.deviceId}
            onClick={() => useShowStore.getState().setPreview(c.label || "Camera", [cameraSlide(c)])}
            onDoubleClick={() => { useShowStore.getState().setPreview(c.label || "Camera", [cameraSlide(c)]); useShowStore.getState().sendPreviewLive(0); }}
            className="rounded-lg p-1.5 text-left hover:bg-surface-4">
            <div className="aspect-video overflow-hidden rounded-md bg-ink ring-1 ring-line"><CameraFeed deviceId={c.deviceId} /></div>
            <div className="mt-1.5 truncate px-0.5 text-[13px] font-semibold text-ink">{c.label || "Camera"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
