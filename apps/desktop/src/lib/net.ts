import { useAppStore } from "../stores/app-store";

let cachedOnline: boolean | null = null;
let lastCheck = 0;

export async function isOnline(): Promise<boolean> {
  if (!navigator.onLine) return false;

  if (Date.now() - lastCheck < 10000 && cachedOnline !== null) return cachedOnline;

  const session = useAppStore.getState().session;
  const url = session?.serverUrl || "https://worshiphq.app";
  try {
    const res = await fetch(`${url}/api/desktop/plan-check`, {
      method: "HEAD",
      signal: AbortSignal.timeout(4000),
    });
    cachedOnline = res.status < 500;
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
