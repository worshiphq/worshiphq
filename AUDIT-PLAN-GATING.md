# Plan gating & subscription lifecycle audit

Read-only audit, 3 Nov 2026. Every claim below was traced to code. Production state at the time:
169 churches - 161 free, 6 starter, 2 max.

The question behind it: when a church's paid month ends, what actually happens, what do they lose,
and what happens to the data they made while they were paying?

---

## The short answer

**Their data is safe.** Nothing is ever deleted by a plan change. Not on downgrade, not on expiry,
not on cancellation. It is retained, hidden from the UI, and comes straight back on resubscribing.
They can still export all of it, including Max-era records, on any plan.

**Your money is not safe.** Several paid features have no server-side lock at all, reminders to
renew have never been delivered to anyone, and a church that downgrades keeps receiving the
automations it set up while paying.

---

## 1. What happens when the month ends

`src/lib/billing/renewals.ts` is the expiry engine, run once a day at 07:00 UTC from
`vercel.json` -> `src/app/api/cron/automations/route.ts` -> `src/lib/automations/dispatch.ts:51`.

- Period ends -> status becomes `past_due`, church keeps **full paid features**.
- **7 days grace** (`GRACE_DAYS = 7`, `renewals.ts:7`).
- After 7 days -> plan drops to `free`.

Nothing is auto-charged. This is a manual re-payment model.

**Two holes:**

1. **A subscription with no `renewsAt` never expires.** `renewals.ts:33` skips those rows, and
   SuperAdmin's `setChurchPlan` (`src/app/actions/admin.ts:257`) writes only `{ plan }` with no
   dates. **One live Starter church is already in this state** and will never be asked to pay.
2. **No monitoring.** Expiry lives in one daily cron request. If it stops being authorised or times
   out, every subscription runs on forever and nothing alerts you. The FX feed gets an alert; the
   billing cycle does not.

---

## 2. Renewal reminders have never worked

`REMINDER_DAYS = [7, 3, 1]` exists and runs. But:

- It sends **by SMS using the church's own credits** (`renewals.ts:110`, `src/lib/sms/credits.ts:124`).
  A church with no credits is never warned.
- The send result is **ignored**, and the reminder is marked as sent anyway (`renewals.ts:69-78`).
  Never retried.
- **No email fallback**, though `sendEmail` exists and receipts already use it.
- Only an Owner **with a phone number** is looked up (`renewals.ts:113`).

**Evidence it has never worked: `renewalRemindersSent` is empty on all 169 rows.**

And the church sees nothing in-app: `settings-client.tsx:1137` collapses status to
grace/free/active, so **`past_due` is never shown**. A church inside its grace window sees a normal
"active" plan with no warning, then drops to Free and blames us.

---

## 3. Paid features with no server lock (revenue leak)

Gating works through `featureForSection` (`src/lib/plan-gate.ts:151`), which can only gate a feature
whose key is **also a permission section**. Everything else needs a hand-written check, and only
baptisms and linked-churches ever got one.

| Feature | Sold on | Reality |
|---|---|---|
| `form-builder` | Starter | **No check at all, and not even hidden.** `src/app/actions/forms.ts:19` |
| `import-export` | Starter | No check; gated on core `people` instead. `src/app/actions/import.ts:56` |
| `custom-roles` | Pro | No check; `assertCanWrite(session)` with no module. `src/app/actions/settings.ts:488` |
| `automations` | Pro | Gated at `reminders` (Starter). Starter gets the Pro engine. `src/app/actions/automations.ts` |
| `auto-receipts` | Starter | `sendChurchSms` has no plan check anywhere |
| `white-label-posters` | Max | Client-side only; trivially bypassed |

**Downgrade does not stop scheduled work.** No file in `src/lib/automations/` checks the plan. A
church dropping Max -> Free keeps getting counselling reminders and roster announcements forever.

---

## 4. Features sold but never built

Found only in the plan table, the pricing page and the upgrade-celebration screen:

`api-access`, `auto-inactive`, `advanced-reports`, `recurring-giving`, `volunteer-scheduling`,
`member-ids`, `fund-accounting` (a duplicate of `accounting`), and `engagement-scoring` - which is
just a label derived from `status` and shown to every plan.

This is refund and reputation exposure, not merely a gap.

---

## 5. Their data after downgrade (the main question)

**Retained, hidden, recoverable, exportable.**

- No destructive operation is tied to any plan change anywhere in `src/lib/billing/`,
  `src/lib/automations/` or `src/app/actions/admin.ts`.
- Downgrade only writes `Subscription.plan`. Rows stay in Postgres untouched.
- Resubscribing restores everything instantly.
- **Export is not plan-gated** (`src/lib/export/datasets.ts:604`), so a leaving church can take
  budgets, counselling records, rosters and the audit log with them. Right for data portability;
  wrong as gating, and counselling data is the most sensitive thing in the product.

**Member limit:** a Pro church with 250 members dropping to Free keeps all 250. Nobody is deleted;
they simply cannot add more. Three paths skip the cap though: the public visitor form
(`visit.ts:127`), self check-in (`self-checkin.ts:255`) and visitor CSV import.

---

## 6. Suspension is a curtain, not a lock

`Church.suspended` is enforced in **one** place: `src/app/app/layout.tsx:50` refuses to render.

- Server actions and `/api/export/*` **do not check it**. A suspended church's session can still
  write and still pull data through the API.
- Meanwhile the legitimate admin **cannot reach their own export page**, because the layout won't
  render. Locked out the front door, open at the back.

---

## 7. Bypass codes

`grantPlanBypass` (`src/app/actions/admin.ts:267`):

- Always grants **12 months**, hardcoded (`src/app/actions/settings.ts:1028`). A free *month* is impossible.
- Redeemable by **any signed-in user of that church**, down to a Volunteer - no Owner check.
- 6-digit code from `Math.random()`, stored plaintext, **no expiry, no rate limit**.
- Any SuperAdmin can grant one, not just the owner.

---

## Fix order

**Costing money now**
1. Server-gate `form-builder`, `import-export`, `custom-roles`; move `automations` to its own tier
2. Make `setChurchPlan` write `renewsAt`, and fix the one live church with none
3. Plan-check the scheduled automations so downgrade actually stops them
4. Bypass: Owner-only redemption, chosen duration, expiry, rate limit, `crypto` not `Math.random`

**Costing trust**
5. Reminders by email as well as SMS, on our cost not theirs; retry on failure; show `past_due` in-app
6. Alert the owner if a billing cycle fails to run

**Correctness**
7. Decide and fix the features sold but not built - build, or remove from the pricing page
8. Enforce `suspended` in server actions, and leave an explicit export escape hatch
9. Cap the three member-creation paths that skip the limit

**Naming trap worth knowing:** `status: "grace"` does **not** mean "in the grace window". It means a
permanent free gift, and those rows are excluded from billing entirely. Two opposite meanings for
one word.
