# Pricing & feature decisions - 3 Nov 2026

Decisions taken by Doctor WorshipSax after the plan-gating audit
(see AUDIT-PLAN-GATING.md). Nothing here is built yet.

## Order of work

1. **Finance app first** (SuperAdmin, owner-only) - before any of the features below.
2. Then `member-ids` and `auto-inactive`.
3. Then the rest.

---

## Build

### `member-ids` (Starter)
Printable membership cards: photo, name, member ID, church logo, QR.
Everything needed already exists (photos, member ID generator, QR). Mostly a print layout.
**Note: "Member ID cards & baptism certificates" is ALREADY on the live Starter pricing card, so
this is currently being sold and not delivered. Build it or pull the line.**

### `auto-inactive` (Max)
After N weeks with no attendance, move the member to `inactive` automatically.
Absence detection already exists (the "we miss you" texts). Needs the status flip plus a
per-church threshold setting.

---

## Mark "Coming soon"

- `recurring-giving` (Pro) - deferred until online giving reopens. Needs stored payment
  authorisations, retry on failure, cancellation.
- `api-access` (Max) - deferred. Once churches build against it, it cannot change freely.
- `volunteer-scheduling` (Pro) - build only if cheap on top of rosters; otherwise "coming soon".

---

## Remove from pricing

- **Email broadcasts** - come off the pricing page entirely for now. The current email setup
  (Brevo SMTP) cannot carry broadcast volume.
- **Sender name on Pro** - the SMS sender name is showing on the Pro card and should not be.
  NOT YET LOCATED: it is not in `PlatformConfig.planDefs[*].marketingFeatures` for starter, pro or
  max. Check the marketing site content editor in SuperAdmin and the `/pricing` page source.

---

## Pro vs Max: keep Max worth buying

**The problem, confirmed in code:** `accounting` is a **Pro** feature
(`src/lib/plan-gate.ts:76`). Max's extra is `fund-accounting`
(`src/lib/plan-gate.ts:82`), which is **a duplicate label that does nothing** - the accounting page
gates on `accounting` only. So today Pro gets the whole finance module and Max adds nothing.

**Decision:** fold `fund-accounting` into accounting, but keep a real Max difference.

**Suggested split** (to confirm before building):
- **Pro - Accounting:** accounts, income and expenses, statements per account. What a church needs
  to know where its money is.
- **Max - Fund accounting:** *restricted* funds. Money given to the building fund cannot be spent
  on salaries; each fund carries its own enforced balance, and spending against a fund is checked.
  Plus fund-level reporting.

That is a genuine reason to move Pro -> Max, not a relabel.

---

## Team members (not church members)

- **Invite team members by SMS by default.** Email optional, chosen by the admin.
  (The existing invite already sends SMS - confirm there is no email-only path.)
- **All team members see the calendar by default**, unless an admin turns it off for a role.

---

## Still outstanding from the audit

Highest value first, all still unfixed:

1. `automations` gated at `reminders` (Starter) instead of its own Pro tier.
2. Scheduled automations never check the plan - a downgraded church keeps receiving everything.
3. `setChurchPlan` writes no `renewsAt`, so hand-set plans never expire.
   **One live Starter church is already in this state.**
4. Renewal reminders have never been delivered to anyone (`renewalRemindersSent` empty on all 169
   churches). They send on the church's own SMS credits, fail silently, and are marked sent anyway.
5. `past_due` is never shown in the app - a church in its 7-day grace window sees "active".
6. Bypass codes: always 12 months, redeemable by any user of the church, `Math.random()` code,
   no expiry, no rate limit.
7. Suspended churches: server actions and `/api/export/*` do not check `suspended`, while the
   legitimate admin cannot reach their own export page.

---

## Finance app - requirements as given

- Lives in SuperAdmin, **hidden from the partner** (an admin SuperAdmin) unless explicitly granted.
- Two ledgers side by side: **WorshipHQ (the site)** and **Dr. WorshipSax overall**.
- Automatic income entries from real site earnings: plan subscriptions and SMS top-ups.
- Manual income and manual expenses, including payments made to the partner.
- Shows what is left, or what should be left.
- **Installable as a web app** (home screen), stays logged in, live updates, usable from a phone.

**Non-negotiable:** `requireSuperAdminOwner()` on **every route and every action**, not just the
page. `Church.suspended` and the paid features in the audit were all enforced in one place and open
everywhere else - this must not repeat for personal financial data.
