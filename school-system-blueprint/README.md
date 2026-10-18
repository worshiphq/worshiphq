# SchoolOS (working title) — Wodona Tech

Multi-tenant school management for **Nursery → JHS** schools in Ghana. Phase 1 focus: **Attendance · Report cards · Fees**, with a mobile-first parent portal.

> This folder is a **planning blueprint + project scaffold**. No UI application code is written yet.

## Start here

| Read | What it is |
|---|---|
| [`docs/01-requirements.md`](docs/01-requirements.md) | Full requirements (numbered `FR-…`, roles, Ghana rules, NFRs, business rules, acceptance criteria, roadmap, open questions) |
| [`docs/02-blueprint.md`](docs/02-blueprint.md) | Modules, role matrix, flows, route map, architecture, milestones, risks, screen index |
| [`docs/03-data-model.md`](docs/03-data-model.md) | ER diagram, design decisions, invariants, known gaps |
| [`design/index.html`](design/index.html) | Gallery of all 53 images (49 screens + 4 diagrams) |
| [`design/images/`](design/images) | The generated PNGs (`W##` = screens, `D##` = diagrams) |
| [`prisma/schema.prisma`](prisma/schema.prisma) | The database schema (43 models) |

## What's in the scaffold

```
prisma/schema.prisma   database schema (validated; pushed + seeded against Postgres 16)
prisma/seed.ts         demo school, Ghana levels, grading scales, assessment schemes, admin user
src/lib/grading.ts     weighted totals, grade lookup, tie-aware ranking     (tested)
src/lib/fees.ts        oldest-first payment allocation, discounts, status    (tested)
src/lib/permissions.ts role → permission matrix
src/lib/db.ts          tenant-scoped Prisma client (injects schoolId)
src/app/…              empty route folders matching the route map
tests/                 vitest unit tests (12 passing)
design/                wireframe generator (HTML → PNG via Playwright) + output
```

## Commands

```bash
npm install
cp .env.example .env            # set DATABASE_URL
npx prisma db push              # create tables
npm run db:seed                 # demo data (admin@demo.test / change-me-now — change it)
npm test                        # unit tests
npm run wireframes              # regenerate design/images (needs Chromium; set CHROMIUM_PATH if needed)
```

## Honest status

- Verified: schema validates and applies to PostgreSQL 16; seed is idempotent; TypeScript type-checks; unit tests pass.
- **Not** done: any Next.js pages, auth, API, jobs, PDF, payments/SMS integrations. `package.json` pins the same Next/React versions used elsewhere in the Wodona workspace; **read the Next.js docs for that version before writing app code** — conventions may differ from older releases.
- Seeded grading bands and the plan pricing are **placeholders** to confirm with the first pilot school.
- Wireframes are low-fidelity layouts with fictional data ("Bright Future Academy", Kumasi).
- Product name "SchoolOS" is a working title.
