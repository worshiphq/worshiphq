"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

export function DemoForm() {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    // Stubbed submit — wire to /api/contact (email integration) when keys are added.
    setTimeout(() => setState("done"), 1100);
  }

  return (
    <div className="card-surface p-6 sm:p-8">
      <AnimatePresence mode="wait">
        {state === "done" ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center py-10 text-center"
          >
            <div className="mb-5 grid size-14 place-items-center rounded-full bg-success/15 text-success">
              <Check className="size-7" />
            </div>
            <h3 className="font-display text-xl font-semibold">Request received!</h3>
            <p className="mt-2 max-w-sm text-sm text-ink-muted">
              Thank you — our team will reach out within one working day to schedule your demo.
            </p>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={onSubmit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input id="name" required placeholder="Rev. Daniel Mensah" />
              </div>
              <div>
                <Label htmlFor="church">Church name</Label>
                <Input id="church" required placeholder="Grace Temple" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required placeholder="you@church.org" />
              </div>
              <div>
                <Label htmlFor="phone">Phone / WhatsApp</Label>
                <Input id="phone" placeholder="+233 20 000 0000" />
              </div>
            </div>
            <div>
              <Label htmlFor="size">Approximate membership</Label>
              <select
                id="size"
                className="flex h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <option>Under 50</option>
                <option>50 – 250</option>
                <option>250 – 1,000</option>
                <option>Over 1,000</option>
                <option>Multi-branch</option>
              </select>
            </div>
            <div>
              <Label htmlFor="message">Anything we should know?</Label>
              <Textarea id="message" placeholder="Tell us a little about your church and what you're hoping to improve." />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={state === "loading"}>
              {state === "loading" ? (
                <>
                  <Loader2 className="whq-spin" /> Sending…
                </>
              ) : (
                "Request demo"
              )}
            </Button>
            <p className="text-center text-xs text-ink-faint">
              By submitting, you agree to be contacted about WorshipHQ. We never share your details.
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
