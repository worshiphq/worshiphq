import { useAppStore } from "../stores/app-store";

let cachedOnline: boolean | null = null;
let lastCheck = 0;

export async function isOnline(): Promise<boolean> {
  if (Date.now() - lastCheck < 5000 && cachedOnline !== null) return cachedOnline;
  try {
    const session = useAppStore.getState().session;
    if (!session?.serverUrl) return navigator.onLine;
    const res = await fetch(`${session.serverUrl}/api/health`, {
      method: "HEAD",
      signal: AbortSignal.timeout(4000),
    });
    cachedOnline = res.ok;
  } catch {
    cachedOnline = navigator.onLine;
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
