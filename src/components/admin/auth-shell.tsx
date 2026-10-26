export const authInput =
  "h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none focus:ring-2 focus:ring-teal-400/20";
export const authButton =
  "h-11 w-full rounded-xl bg-teal-500 text-sm font-semibold text-white shadow-none transition-colors hover:bg-teal-400";
export const authGhost =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10";

/** The dark card the platform admin sign-in, code and password-reset pages sit in. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 w-fit rounded-2xl bg-white px-5 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo2.png" alt="WorshipHQ" className="h-12 w-auto" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AuthNotice({ tone = "error", children }: { tone?: "error" | "ok"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          : "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
      }
    >
      {children}
    </div>
  );
}

export const authCard = "space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur";
