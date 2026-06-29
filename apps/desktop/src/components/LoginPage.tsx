import { useState } from "react";
import { Loader2, Wifi, WifiOff, Eye, EyeOff, AlertCircle, ExternalLink } from "lucide-react";
import { auth, sync } from "../lib/api";
import { useAppStore } from "../stores/app-store";

const SERVER_URL = "https://worshiphq.app";

export function LoginPage() {
  const { setSession, setSyncStatus, showToast } = useAppStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

    try {
      const result = await auth.login(SERVER_URL, email, password);

      if (result.success && result.user) {
        const session = await auth.getSession();
        setSession(session);
        showToast(`Welcome, ${result.user.name}!`);

        const status = await sync.now();
        setSyncStatus(status);
      } else {
        setError(result.error || "Login failed. Check your email and password.");
      }
    } catch (err: any) {
      setError(err?.message || "Connection failed. Please check your internet connection.");
    }

    setLoading(false);
  }

  function handleForgotPassword() {
    window.api?.openExternal(`${SERVER_URL}/sign-in?reset=1`);
  }

  return (
    <div className="flex flex-1 bg-base">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between border-r border-line bg-surface p-10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        <div className="relative flex items-center justify-center flex-1">
          <img src="/logo.png" alt="WorshipHQ" className="h-40 w-auto object-contain" />
        </div>
        <div className="relative max-w-md">
          <p className="text-lg font-medium leading-snug text-ink">
            &ldquo;We moved 1,200 members onto WorshipHQ in a weekend. Online giving alone has transformed our offerings.&rdquo;
          </p>
          <p className="mt-3 text-sm text-ink-muted">Rev. Daniel Mensah &middot; Grace Temple, Accra</p>
        </div>
        <div className="relative text-xs text-ink-faint mt-6">
          &copy; {new Date().getFullYear()} WorshipHQ
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          {/* Logo for narrow view */}
          <div className="mb-8 lg:hidden text-center">
            <img src="/icon.png" alt="WorshipHQ" className="mx-auto h-16 w-auto object-contain" />
          </div>

          <h1 className="text-3xl font-bold text-ink">Welcome back</h1>
          <p className="mt-2 text-sm text-ink-muted">Log in to your church&rsquo;s command center.</p>

          {/* Connection status */}
          <div className="mt-4 flex items-center gap-2">
            {online ? (
              <>
                <Wifi className="size-3.5 text-success" />
                <span className="text-xs text-success font-medium">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="size-3.5 text-danger" />
                <span className="text-xs text-danger font-medium">Offline &mdash; login requires internet</span>
              </>
            )}
          </div>

          {error && (
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Email</label>
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-ink">Password</label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="flex items-center gap-1 text-xs text-primary-bright hover:underline"
                >
                  Forgot password?
                  <ExternalLink className="size-3" />
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-0 top-0 grid h-full w-10 place-items-center text-ink-faint transition-colors hover:text-ink"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !online}
              className="btn-primary w-full py-2.5 text-sm font-semibold"
            >
              {loading && <Loader2 className="size-4 whq-spin" />}
              {loading ? "Connecting..." : "Log in"}
            </button>
          </form>

          {!online && (
            <p className="mt-4 text-center text-xs text-ink-faint">
              You need internet to log in for the first time. After that, the app works fully offline.
            </p>
          )}

          <p className="mt-8 text-center text-[11px] text-ink-faint">
            Data stored locally &middot; Syncs with your WorshipHQ account
          </p>
        </div>
      </div>
    </div>
  );
}
