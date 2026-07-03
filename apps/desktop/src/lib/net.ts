import { useAppStore } from "../stores/app-store";

let cachedOnline: boolean | null = null;
let lastCheck = 0;

export async function isOnline(): Promise<boolean> {
  if (Date.now() - lastCheck < 3000 && cachedOnline !== null) return cachedOnline;
  const session = useAppStore.getState().session;
  const url = session?.serverUrl || "https://worshiphq.app";
  try {
    const res = await fetch(`${url}/api/health`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    cachedOnline = res.ok;
  } catch {
    try {
      const g = await fetch("https://clients3.google.com/generate_204", {
        method: "HEAD",
        signal: AbortSignal.timeout(3000),
      });
      cachedOnline = g.ok || g.status === 204;
    } catch {
      cachedOnline = false;
    }
  }
  lastCheck = Date.now();
  return cachedOnline;
}

export async function requireOnline(action: string): Promise<boolean> {
  const online = await isOnline();
  if (!online) {
    useAppStore.getState().showToast(
      `Connect to the internet to ${action}`,
      "error"
    );
    return false;
  }
  return true;
}
