"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  Church, User, AtSign, Lock, Sparkles, Check, ArrowLeft, ArrowRight,
  AlertCircle, Loader2, ClipboardCheck,
} from "lucide-react";
import { signUp } from "@/app/actions/auth";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PASSWORD_RULES, passwordMeetsPolicy } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

export interface WizardPlan {
  id: string;
  name: string;
  monthly: number;
  members: string;
  features: string[];
}

const STEPS = [
  { key: "church", label: "Church", icon: Church, title: "What's your church called?", sub: "This becomes the name of your WorshipHQ workspace." },
  { key: "you", label: "You", icon: User, title: "And what's your name?", sub: "You'll be the owner of this church account." },
  { key: "contact", label: "Contact", icon: AtSign, title: "How do we reach you?", sub: "We'll send a one-time code to verify your phone." },
  { key: "password", label: "Security", icon: Lock, title: "Set a password", sub: "At least 8 characters, with a capital letter, a number and a symbol." },
  { key: "plan", label: "Plan", icon: Sparkles, title: "Choose your plan", sub: "Start free and upgrade any time — or jump straight in." },
  { key: "review", label: "Review", icon: ClipboardCheck, title: "Everything look right?", sub: "One tap and we'll send your verification code." },
] as const;

export function SignupWizard({
  plans,
  currencySymbol,
  initialPlan,
  errorMessage,
}: {
  plans: WizardPlan[];
  currencySymbol: string;
  initialPlan: string;
  errorMessage: string | null;
}) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [touchedError, setTouchedError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [data, setData] = useState({
    church: "",
    name: "",
    email: "",
    phone: "",
    password: "",
    plan: initialPlan,
  });

  const set = (key: keyof typeof data) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setData((d) => ({ ...d, [key]: e.target.value }));

  const selectedPlan = useMemo(() => plans.find((p) => p.id === data.plan) ?? plans[0], [plans, data.plan]);

  function validate(i: number): string | null {
    switch (STEPS[i].key) {
      case "church":
        return data.church.trim().length >= 2 ? null : "Please enter your church name.";
      case "you":
        return data.name.trim().length >= 2 ? null : "Please enter your name.";
      case "contact": {
        if (!/^\S+@\S+\.\S+$/.test(data.email.trim())) return "Please enter a valid email address.";
        if (data.phone.trim().replace(/\D/g, "").length < 9) return "Please enter a valid phone number.";
        return null;
      }
      case "password": {
        if (passwordMeetsPolicy(data.password)) return null;
        const missing = PASSWORD_RULES.filter((r) => !r.test(data.password)).map((r) => r.label.toLowerCase());
        return `Your password still needs: ${missing.join(", ")}.`;
      }
      default:
        return null;
    }
  }

  function next() {
    const err = validate(step);
    if (err) { setTouchedError(err); return; }
    setTouchedError(null);
    setDir(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setTouchedError(null);
    setDir(-1);
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && step < STEPS.length - 1) {
      e.preventDefault();
      next();
    }
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Start your church</h1>
      <p className="mt-2 text-sm text-ink-muted">Create your WorshipHQ account in a minute.</p>

      {errorMessage && (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* ── Step indicator ── */}
      <div className="mt-7 flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => { if (i < step) { setDir(-1); setStep(i); setTouchedError(null); } }}
            disabled={i > step}
            aria-label={s.label}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all duration-500",
              i < step ? "bg-primary/60" : i === step ? "bg-primary" : "bg-line",
              i < step && "cursor-pointer hover:bg-primary",
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
        Step {step + 1} of {STEPS.length} · {STEPS[step].label}
      </p>

      {/* Real form so the server action + SMS verification flow stays intact */}
      <form
        ref={formRef}
        action={signUp}
        onSubmit={() => setSubmitting(true)}
        onKeyDown={handleKeyDown}
        className="mt-6"
      >
        {/* Hidden mirrors of every collected value */}
        <input type="hidden" name="church" value={data.church} />
        <input type="hidden" name="name" value={data.name} />
        <input type="hidden" name="email" value={data.email} />
        <input type="hidden" name="phone" value={data.phone} />
        <input type="hidden" name="password" value={data.password} />
        <input type="hidden" name="plan" value={data.plan} />

        <div className="relative overflow-hidden">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 44 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -44 }}
              transition={{ duration: 0.35, ease }}
            >
              <div className="mb-5">
                <h2 className="font-display text-xl font-bold text-ink">{STEPS[step].title}</h2>
                <p className="mt-1 text-sm text-ink-muted">{STEPS[step].sub}</p>
              </div>

              {STEPS[step].key === "church" && (
                <div>
                  <Label htmlFor="w-church">Church name</Label>
                  <Input id="w-church" value={data.church} onChange={set("church")} placeholder="Grace Temple" autoFocus />
                </div>
              )}

              {STEPS[step].key === "you" && (
                <div>
                  <Label htmlFor="w-name">Your name</Label>
                  <Input id="w-name" value={data.name} onChange={set("name")} placeholder="Rev. Daniel Mensah" autoFocus />
                </div>
              )}

              {STEPS[step].key === "contact" && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="w-email">Email</Label>
                    <Input id="w-email" type="email" value={data.email} onChange={set("email")} placeholder="you@church.org" autoFocus />
                  </div>
                  <div>
                    <Label htmlFor="w-phone">Phone (for verification)</Label>
                    <Input id="w-phone" type="tel" value={data.phone} onChange={set("phone")} placeholder="024 000 0000" />
                  </div>
                </div>
              )}

              {STEPS[step].key === "password" && (
                <div>
                  <Label htmlFor="w-password">Password</Label>
                  <PasswordInput
                    id="w-password"
                    value={data.password}
                    onChange={set("password")}
                    placeholder="e.g. Sunday@2026"
                    autoFocus
                  />

                  {/* Strength bar — one segment per rule met */}
                  <div className="mt-3 flex gap-1">
                    {PASSWORD_RULES.map((r, i) => {
                      const met = PASSWORD_RULES.filter((x) => x.test(data.password)).length;
                      return (
                        <span
                          key={r.key}
                          className={cn(
                            "h-1 flex-1 rounded-full transition-colors duration-300",
                            i < met ? (met === 4 ? "bg-success" : met >= 3 ? "bg-gold" : "bg-warning") : "bg-line",
                          )}
                        />
                      );
                    })}
                  </div>

                  {/* Live requirements checklist */}
                  <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {PASSWORD_RULES.map((r) => {
                      const ok = r.test(data.password);
                      return (
                        <li
                          key={r.key}
                          className={cn(
                            "flex items-center gap-2 text-xs transition-colors duration-300",
                            ok ? "text-success" : "text-ink-faint",
                          )}
                        >
                          <span
                            className={cn(
                              "grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-300",
                              ok ? "border-success bg-success text-white" : "border-line bg-surface",
                            )}
                          >
                            {ok && <Check className="size-2.5" strokeWidth={3} />}
                          </span>
                          {r.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {STEPS[step].key === "plan" && (
                <div>
                  <div className="grid grid-cols-2 gap-2">
                    {plans.map((p) => {
                      const active = data.plan === p.id;
                      return (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => setData((d) => ({ ...d, plan: p.id }))}
                          className={cn(
                            "rounded-xl border p-3 text-center transition-all",
                            active
                              ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                              : "border-line hover:border-primary/30",
                          )}
                        >
                          <div className="font-display text-sm font-semibold">{p.name}</div>
                          <div className="mt-0.5 text-xs text-ink-muted">
                            {p.monthly === 0 ? "Free forever" : `${currencySymbol}${p.monthly.toLocaleString()}/mo`}
                          </div>
                          <div className="mt-1 text-[10px] text-ink-faint">{p.members}</div>
                        </button>
                      );
                    })}
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.ul
                      key={data.plan}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="mt-4 space-y-1.5"
                    >
                      {selectedPlan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-xs text-ink-muted">
                          <Check className="size-3 text-success" /> {f}
                        </li>
                      ))}
                    </motion.ul>
                  </AnimatePresence>
                </div>
              )}

              {STEPS[step].key === "review" && (
                <div className="divide-y divide-line-soft rounded-xl border border-line bg-surface">
                  {[
                    { label: "Church", value: data.church },
                    { label: "Your name", value: data.name },
                    { label: "Email", value: data.email },
                    { label: "Phone", value: data.phone },
                    {
                      label: "Plan",
                      value: `${selectedPlan.name}${selectedPlan.monthly > 0 ? ` · ${currencySymbol}${selectedPlan.monthly}/mo` : " · Free forever"}`,
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between px-4 py-3">
                      <span className="text-xs uppercase tracking-wide text-ink-faint">{row.label}</span>
                      <span className="max-w-[60%] truncate text-sm font-medium text-ink">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {touchedError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-center gap-1.5 text-xs text-danger"
          >
            <AlertCircle className="size-3.5" /> {touchedError}
          </motion.p>
        )}

        {/* ── Nav buttons ── */}
        <div className="mt-7 flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-line px-5 text-sm font-medium text-ink-muted transition-colors hover:border-ink/30 hover:text-ink"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>
          )}
          {!isLast ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-bright"
            >
              Continue
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-bright disabled:opacity-60"
            >
              {submitting && <Loader2 className="size-4 whq-spin" />}
              {submitting ? "Sending code…" : "Create account — verify phone"}
            </button>
          )}
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-primary-bright hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
