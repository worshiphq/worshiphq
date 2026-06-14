import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getSuperAdmin } from "@/lib/auth";
import { superAdminSignIn } from "@/app/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sa = await getSuperAdmin();
  if (sa) redirect("/admin");
  const { error } = await searchParams;

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-teal-500/10 text-teal-400">
            <ShieldCheck className="size-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">WorshipHQ Platform Admin</h1>
          <p className="mt-1 text-sm text-slate-400">Restricted area — owner access only.</p>
        </div>

        <form
          action={superAdminSignIn}
          className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
        >
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              Invalid credentials.
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
            <input
              name="email"
              type="email"
              required
              placeholder="worshiphqapp@gmail.com"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400/60 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Password</label>
            <input
              name="password"
              type="password"
              required
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-slate-100 focus:border-teal-400/60 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
            />
          </div>
          <SubmitButton
            pendingLabel="Signing in…"
            overlay={false}
            className="h-11 w-full rounded-xl bg-teal-500 text-sm font-semibold text-white shadow-none transition-colors hover:bg-teal-400"
          >
            Sign in
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
