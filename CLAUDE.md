# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A household finance web app that imports CSV transaction data, categorizes it, and generates financial reports (monthly/annual balance, asset trends, portfolio, split-payment/割り勘). The app lives entirely under `webapp/` and is a TypeScript full-stack app running on Cloudflare Workers.

> The project was originally a Google Apps Script (GAS) app that used a Google Spreadsheet as both UI and database. That version has been fully migrated to `webapp/` and its source has been removed. Historical design/migration notes remain under `docs/`, and the one-off data-migration scripts remain under `webapp/scripts/`.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React / Vite / TypeScript (SPA) |
| API | Hono on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Auth | Cloudflare Access (JWT verification) |
| Tests | Vitest |

## Development Workflow

All commands run from `webapp/`. There is no build/test tooling at the repo root.

```bash
cd webapp
npm install
cp .dev.vars.example .dev.vars   # first time only
npm run db:migrate:local         # apply migrations to local D1
npm run dev                      # SPA + /api/* on one origin
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server (SPA + API) |
| `npm run build` | Typecheck + production build |
| `npm test` | Run the Vitest suite |
| `npm run typecheck` | Typecheck only (`tsc --noEmit`) |
| `npm run db:migrate:local` | Apply migrations to local D1 |
| `npm run db:migrate:remote` | Apply migrations to production D1 |
| `npm run db:import:sheets` | Import legacy spreadsheet CSVs into local D1 |
| `npm run deploy` | Build and deploy to Cloudflare Workers (runs remote migrations first) |

In local dev, `.dev.vars` sets `DEV_BYPASS_ACCESS=true` to disable Cloudflare Access verification. Never enable this in production.

## Architecture

```
webapp/
├── src/
│   ├── client/        # React SPA
│   │   ├── pages/     # route pages incl. settings/ and report/ sections
│   │   ├── components/
│   │   └── lib/api.ts # typed client for /api/*
│   ├── server/        # Hono API on Cloudflare Workers
│   │   ├── routes/    # one Hono router per resource (settings, splitwise, reports, …)
│   │   ├── services/  # repository.ts (all D1 access) + domain services
│   │   └── index.ts   # Workers entry, route mounting, Access middleware
│   └── shared/        # code shared by client & server: types.ts + pure domain logic
├── migrations/        # D1 schema + seed (numbered NNNN_*.sql, applied in order)
├── scripts/           # one-off legacy-spreadsheet → D1 migration scripts
└── test/              # Vitest (one file per module)
```

**Key architectural facts:**
- **Layering:** routes (HTTP) → services (`repository.ts` for all D1 access; domain services for logic) → `shared/` pure functions. Pure domain logic (categorization, CSV parsing, splitwise, reports) lives in `shared/` with no runtime/D1 dependency so it is unit-testable in isolation.
- **Types are shared:** `shared/types.ts` defines DB row shapes and API payloads used by both client and server. `TABLE_NAMES` there is kept in sync with the D1 schema (see `test/schema.test.ts`).
- **Migrations are append-only:** add a new `NNNN_*.sql` (never edit an applied one). `0001_initial.sql` = schema, `0002_seed.sql` = seed data. `schema.test.ts` asserts migrations match the type layer.
- **Transaction categorization** is keyword + institution rule based (`category_rules`), with `priority` where **smaller numbers win** (default 100).
- **Splitwise (割り勘)** matches transactions against `split_rules` (`match_type` = `keyword`|`institution`, substring match) to assign a rate (%). On multiple matches, resolution is by `priority` ascending (**smaller wins**, default 100), then institution-before-keyword, then rate desc, then id — see `shared/splitwise.ts`. Only `type='支出'` and `category !== '振替'` are eligible.
- **Auth:** production `/api/*` is gated by Cloudflare Access; the Workers entry verifies the Access JWT (bypassed locally via `DEV_BYPASS_ACCESS`).

## Data & Config Notes

- Domain data (categories, sheet names, transaction schema) is in Japanese.
- `webapp/wrangler.jsonc` holds Cloudflare Workers/D1/Access config. `ALLOWED_EMAILS` (comma-separated) is a Worker Secret controlling access.
- Legacy data migration: export the five spreadsheet CSVs into the repo-root `input/` (gitignored), then `npm run db:import:sheets`. Generated SQL lands in `webapp/.migrate-tmp/`. See `webapp/README.md` for full details.

## Conventions

- Match the surrounding code's style, naming, and comment density. Japanese comments/identifiers are the norm in domain code.
- Prefer adding logic to `shared/` (pure, tested) over embedding it in routes.
- When changing the DB schema, add a migration, update `shared/types.ts`, and keep `schema.test.ts` passing.
