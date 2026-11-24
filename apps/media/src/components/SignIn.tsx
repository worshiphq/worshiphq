import { useEffect, useState } from "react";
import { CreditCard, Loader2, LogIn, Monitor, X } from "lucide-react";
import { buyMedia, finishSignUp, mediaPrices, startSignUp, useAccountStore, type NewAccount, type OtherComputer, type Quote } from "../lib/account";
import logoMark from "../assets/worshiphq-mark.png";

async function openSite(url: string) {
  try { const { open } = await import("@tauri-apps/plugin-shell"); await open(url); } catch { window.open(url, "_blank"); }
}

/** Email/phone + password for the church's WorshipHQ account. Handles "all your computers are in use". */
export function SignInForm({ onDone, onCreate }: { onDone?: () => void; onCreate?: () => void }) {
  const signIn = useAccountStore((s) => s.signIn);
  const notice = useAccountStore((s) => s.notice);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState<OtherComputer[] | null>(null);

  async function go(replaceDeviceId?: string) {
    if (!login.trim() || !password) { setError("Enter your email or phone number and your password."); return; }
    setBusy(true); setError(null);
    const r = await signIn(login.trim(), password, replaceDeviceId);
    setBusy(false);
    if (r.ok) { setFull(null); onDone?.(); return; }
    setError(r.error);
    setFull(r.seatsFull?.devices ?? null);
  }

  if (full) {
    return (
      <div className="grid gap-3 text-left">
        <p className="text-[14px] text-ink">{error}</p>
        <p className="text-[13px] text-ink-muted">Choose a computer to sign out, and this one takes its place:</p>
        <div className="grid gap-1.5">
          {full.map((d) => (
            <button key={d.id} disabled={busy} onClick={() => go(d.id)}
              className="flex items-center gap-3 rounded-lg border border-line-bright px-3 py-2.5 text-left hover:border-primary hover:bg-primary-soft/50 disabled:opacity-60">
              <Monitor className="size-5 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-ink">{d.name}</span>
                <span className="block text-[12px] text-ink-faint">Last used {new Date(d.lastSeenAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
              </span>
              <span className="text-[12px] font-semibold text-primary-bright">Sign it out</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {busy && <Loader2 className="size-4 whq-spin text-primary-bright" />}
          <button onClick={() => { setFull(null); setError(null); }} className="text-[13px] font-semibold text-ink-muted hover:text-ink">Back</button>
          <span className="flex-1" />
          <button onClick={() => openSite("https://worshiphq.app/pricing")} className="text-[13px] font-semibold text-primary-bright hover:underline">Add more computers</button>
        </div>
      </div>
    );
  }

  return (
    <form className="grid gap-3 text-left" onSubmit={(e) => { e.preventDefault(); go(); }}>
      {notice && !error && <p className="rounded-lg bg-gold/10 px-3 py-2 text-[13px] text-gold">{notice}</p>}
      <label className="grid gap-1">
        <span className="text-[13px] font-medium text-ink-muted">Email or phone number</span>
        <input autoFocus value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username"
          className="h-11 rounded-lg border border-line-bright bg-surface px-3 text-[15px] text-ink" placeholder="pastor@yourchurch.org" />
      </label>
      <label className="grid gap-1">
        <span className="text-[13px] font-medium text-ink-muted">Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
          className="h-11 rounded-lg border border-line-bright bg-surface px-3 text-[15px] text-ink" />
      </label>
      {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
      <button type="submit" disabled={busy}
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-bold text-white hover:bg-primary-bright disabled:opacity-60">
        {busy ? <Loader2 className="size-4 whq-spin" /> : <LogIn className="size-4" />} Sign in
      </button>
      {onCreate && (
        <p className="text-center text-[13px] text-ink-muted">
          <button type="button" onClick={() => openSite("https://worshiphq.app/sign-in")} className="font-semibold text-primary-bright hover:underline">Forgot password?</button>
          {" · "}New to WorshipHQ?{" "}
          <button type="button" onClick={onCreate} className="font-semibold text-primary-bright hover:underline">Create an account</button>
        </p>
      )}
    </form>
  );
}

const field = "h-10 rounded-lg border border-line-bright bg-surface px-3 text-[14px] text-ink";

/** A new account for a church that only wants WorshipHQ Live: details, then the code we email. */
export function SignUpForm({ onDone, onSignIn }: { onDone?: () => void; onSignIn: () => void }) {
  const [f, setF] = useState<NewAccount>({ church: "", city: "", country: "Ghana", name: "", email: "", password: "", acceptedTerms: false });
  const set = (k: keyof NewAccount) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === "acceptedTerms" ? e.target.checked : e.target.value });
  const [vid, setVid] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; exists?: boolean } | null>(null);

  async function send() {
    setBusy(true); setError(null);
    const r = await startSignUp(f);
    setBusy(false);
    if (!r.ok) { setError({ text: r.error, exists: r.exists }); return; }
    setVid(r.verificationId);
    if (r.devCode) setCode(r.devCode);
  }
  async function verify() {
    if (!vid) return;
    setBusy(true); setError(null);
    const r = await finishSignUp(vid, code.trim());
    setBusy(false);
    if (!r.ok) { setError({ text: r.error }); return; }
    onDone?.();
  }

  if (vid) {
    return (
      <form className="grid gap-3 text-left" onSubmit={(e) => { e.preventDefault(); verify(); }}>
        <p className="text-[14px] text-ink">We emailed a 6-digit code to <b>{f.email}</b>. Type it here.</p>
        <input autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="h-12 rounded-lg border border-line-bright bg-surface px-3 text-center font-mono text-[22px] tracking-[0.4em] text-ink" placeholder="000000" />
        {error && <p className="text-[13px] font-medium text-danger">{error.text}</p>}
        <button type="submit" disabled={busy || code.length !== 6}
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-bold text-white hover:bg-primary-bright disabled:opacity-60">
          {busy && <Loader2 className="size-4 whq-spin" />} Create the account
        </button>
        <p className="text-center text-[13px] text-ink-muted">
          No email? Check spam, or{" "}
          <button type="button" disabled={busy} onClick={send} className="font-semibold text-primary-bright hover:underline">send it again</button>
          {" · "}
          <button type="button" onClick={() => { setVid(null); setCode(""); }} className="font-semibold text-primary-bright hover:underline">change the email</button>
        </p>
      </form>
    );
  }

  return (
    <form className="grid gap-2.5 text-left" onSubmit={(e) => { e.preventDefault(); send(); }}>
      <label className="grid gap-1"><span className="text-[13px] font-medium text-ink-muted">Church name</span>
        <input autoFocus value={f.church} onChange={set("church")} className={field} placeholder="Grace Baptist Church" /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1"><span className="text-[13px] font-medium text-ink-muted">Town or city</span>
          <input value={f.city} onChange={set("city")} className={field} placeholder="Accra" /></label>
        <label className="grid gap-1"><span className="text-[13px] font-medium text-ink-muted">Country</span>
          <input value={f.country} onChange={set("country")} className={field} /></label>
      </div>
      <label className="grid gap-1"><span className="text-[13px] font-medium text-ink-muted">Your name</span>
        <input value={f.name} onChange={set("name")} className={field} autoComplete="name" /></label>
      <label className="grid gap-1"><span className="text-[13px] font-medium text-ink-muted">Email</span>
        <input type="email" value={f.email} onChange={set("email")} className={field} autoComplete="email" placeholder="media@yourchurch.org" /></label>
      <label className="grid gap-1"><span className="text-[13px] font-medium text-ink-muted">Password</span>
        <input type="password" value={f.password} onChange={set("password")} className={field} autoComplete="new-password" />
        <span className="text-[12px] text-ink-faint">8 or more characters, with a capital letter, a number and a symbol.</span></label>
      <label className="flex items-start gap-2 text-[13px] text-ink">
        <input type="checkbox" checked={f.acceptedTerms} onChange={set("acceptedTerms")} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
        <span>I agree to the{" "}
          <button type="button" onClick={() => openSite("https://worshiphq.app/terms")} className="font-semibold text-primary-bright hover:underline">Terms</button> and{" "}
          <button type="button" onClick={() => openSite("https://worshiphq.app/privacy")} className="font-semibold text-primary-bright hover:underline">Privacy Policy</button>.</span>
      </label>
      {error && (
        <p className="text-[13px] font-medium text-danger">
          {error.text}{error.exists && <> <button type="button" onClick={onSignIn} className="font-semibold text-primary-bright hover:underline">Sign in</button></>}
        </p>
      )}
      <button type="submit" disabled={busy}
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-bold text-white hover:bg-primary-bright disabled:opacity-60">
        {busy && <Loader2 className="size-4 whq-spin" />} Email me a code
      </button>
      <p className="text-center text-[13px] text-ink-muted">
        14 days free, then {`$19`} a month or {`$190`} a year. Already have an account?{" "}
        <button type="button" onClick={onSignIn} className="font-semibold text-primary-bright hover:underline">Sign in</button>
      </p>
    </form>
  );
}

/** Sign in, or make a new account, in one place. */
export function AccountForms({ onDone, start = "signin" }: { onDone?: () => void; start?: "signin" | "signup" }) {
  const [mode, setMode] = useState(start);
  return mode === "signin"
    ? <SignInForm onDone={onDone} onCreate={() => setMode("signup")} />
    : <SignUpForm onDone={onDone} onSignIn={() => setMode("signin")} />;
}

export function SignInDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/50 p-4" onMouseDown={onClose}>
      <div className="relative my-auto w-full max-w-md rounded-2xl border border-line bg-surface-2 p-6 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 rounded p-1 text-ink-faint hover:bg-surface-4 hover:text-ink" aria-label="Close"><X className="size-5" /></button>
        <div className="mb-4 flex items-center gap-3">
          <img src={logoMark} alt="" className="size-10 rounded-lg bg-white object-contain p-1 ring-1 ring-line" />
          <div>
            <h3 className="text-[17px] font-bold text-ink">Your WorshipHQ account</h3>
            <p className="text-[13px] text-ink-muted">Sign in, or make an account for your church.</p>
          </div>
        </div>
        <AccountForms onDone={onClose} />
      </div>
    </div>
  );
}

/** Pay for WorshipHQ Live (monthly or yearly) through Paystack in the browser. */
export function BuyMedia() {
  const [prices, setPrices] = useState<{ monthly: Quote; yearly: Quote } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { mediaPrices().then(setPrices).catch(() => {}); }, []);
  const price = (q: Quote | undefined, fallback: string) => (q ? `$${q.usd} (GHS ${q.ghs.toLocaleString()})` : fallback);

  async function buy(interval: "monthly" | "yearly") {
    setBusy(interval); setMsg(null);
    try {
      await buyMedia(interval);
      setMsg({ ok: true, text: "Paystack is open in your browser. Pay with Mobile Money or a card; WorshipHQ Live switches on by itself within a minute after." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
    setBusy(null);
  }

  return (
    <div className="grid gap-2">
      {!!prices?.monthly.percentOff && <p className="text-[13px] font-semibold text-success">Your church is on WorshipHQ {prices.monthly.plan[0].toUpperCase() + prices.monthly.plan.slice(1)}, so WorshipHQ Live is {prices.monthly.percentOff}% off.</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => buy("monthly")} disabled={!!busy}
          className="flex h-10 items-center gap-2 rounded-lg border border-primary px-4 text-[14px] font-bold text-primary-bright hover:bg-primary-soft disabled:opacity-60">
          {busy === "monthly" ? <Loader2 className="size-4 whq-spin" /> : <CreditCard className="size-4" />} Monthly · {price(prices?.monthly, "$19")}
        </button>
        <button onClick={() => buy("yearly")} disabled={!!busy}
          className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-bold text-white hover:bg-primary-bright disabled:opacity-60">
          {busy === "yearly" ? <Loader2 className="size-4 whq-spin" /> : <CreditCard className="size-4" />} Yearly · {price(prices?.yearly, "$190")} <span className="font-medium opacity-80">2 months free</span>
        </button>
      </div>
      {msg && <p className={`text-[13px] ${msg.ok ? "text-ink-muted" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
