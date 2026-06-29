import { useState } from "react";
import { Loader2, Wifi, WifiOff, Church } from "lucide-react";
import { auth, sync } from "../lib/api";
import { useAppStore } from "../stores/app-store";

export function LoginPage() {
  const { setSession, setSyncStatus, showToast } = useAppStore();
  const [serverUrl, setServerUrl] = useState("https://worshiphq.com");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);

  window.addEventListener("online", () => setOnline(true));
  window.addEventListener("offline", () => setOnline(false));

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { setError("Enter your email and password"); return; }

    setLoading(true);
    setError("");

    const result = await auth.login(serverUrl, email, password);

    if (result.success && result.user) {
      const session = await auth.getSession();
      setSession(session);
      showToast(`Welcome, ${result.user.name}!`);

      // Trigger initial sync
      const status = await sync.now();
      setSyncStatus(status);
    } else {
      setError(result.error || "Login failed");
    }

    setLoading(false);
  }

  return (
    <div className="flex h-full items-center justify-center bg-base">
      <div className="w-full max-w-md px-6">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-primary-soft">
            <Church className="size-8 text-primary-bright" />
          </div>
          <h1 className="text-2xl font-bold text-ink">WorshipHQ</h1>
          <p className="mt-1 text-sm text-ink-muted">Church Management Desktop</p>
        </div>

        {/* Connection status */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {online ? (
            <>
              <Wifi className="size-3.5 text-success" />
              <span className="text-xs text-success font-medium">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="size-3.5 text-danger" />
              <span className="text-xs text-danger font-medium">Offline</span>
            </>
          )}
        </div>

        <form onSubmit={handleLogin} className="card space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Server URL</label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="input"
              placeholder="https://worshiphq.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@church.org"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-danger">{error}</p>
          )}

          <button type="submit" disabled={loading || !online} className="btn-primary w-full py-2.5">
            {loading && <Loader2 className="size-4 whq-spin" />}
            {loading ? "Connecting..." : "Connect & Sync"}
          </button>

          {!online && (
            <p className="text-center text-xs text-ink-faint">
              You need internet to log in for the first time. After that, the app works fully offline.
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-[11px] text-ink-faint">
          v0.1.0 · Data stored locally · Syncs with your WorshipHQ account
        </p>
      </div>
    </div>
  );
}
