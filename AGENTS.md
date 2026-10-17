# Expense Tracker: guide for coding agents

Personal and shared (household) expense tracking. Read this before changing code; the README covers
features and setup for humans. Next.js-specific rules: `apps/web/AGENTS.md`.

## Architecture

An npm-workspaces monorepo with two servers:

```
apps/api        Express 5 backend. Owns authentication (hand-written), Prisma + Postgres,
                all business rules and every data endpoint. Port 4000.
apps/web        Next.js 16 frontend. Pages and UI only, NO database access. Port 3000.
packages/shared Pure TypeScript used by both: money, dates, csv, splits, categories,
                suggest, redirect. No I/O, no Node or browser APIs.
tests/e2e       Playwright: browser specs + API security spec, against both servers.
```

Request flow:

- **Browser → web → API.** The browser only ever talks to the web app. Its catch-all route
  `apps/web/src/app/api/[...path]/route.ts` proxies `/api/*` to the API at runtime (reads
  `API_URL` per request; a next.config rewrite would be fixed at build time). Cookies stay
  first-party, no CORS.
- **Server components / server actions → API.** `apps/web/src/lib/api.ts` calls the API with the
  visitor's cookies forwarded. Server actions are thin proxies (FormData → JSON → API →
  `refresh()`); the API does all validation and authorization.
- One `.env` at the repo root, loaded by both apps (`apps/api/src/env.ts`, `apps/web/next.config.ts`).

## Stack

- API: Express 5.3, Prisma 7.10 + `@prisma/adapter-pg`, PostgreSQL 17 (Docker), zod 4, pino,
  helmet, express-rate-limit, multer, jose. Dev with `tsx watch`, built with `tsup` to `dist/`.
- Web: Next.js 16 App Router with `cacheComponents` + `partialPrefetching`, React 19, Tailwind 4.
- Tests: Playwright 1.56 using the installed Chrome.

## Commands (from the repo root)

```bash
docker compose up -d            # Postgres on 127.0.0.1:5432 (expense_tracker, expense_tracker_test)
npm run dev                     # API :4000 + web :3000 together
npm run build && npm start      # production builds of both
npm run typecheck && npm run lint
npm run db:migrate -- --name <change>   # prisma migrate dev (in apps/api)
npm run build && npm run test:e2e       # API :4100 + web :3100 against expense_tracker_test
```

Before calling a change done: `typecheck`, `lint`, `build`, and the e2e suite (repeatedly; fix
flakiness at its cause).

## Authentication (apps/api/src/auth)

Hand-written, Node crypto only. Keep these properties:

- **Passwords**: scrypt (N=2^15, r=8, p=1, 16-byte salt), stored `scrypt$N$r$p$salt$hash` on the
  `credential` Account; compared with `timingSafeEqual`. Unknown emails still run a dummy hash
  (`dummyPasswordCheck`) so timing doesn't reveal accounts.
- **Sessions**: random 32-byte token in an httpOnly, SameSite=Lax cookie named `session`
  (Secure in production). The DB stores only `sha256(token)` (`Session.tokenHash`). 30 days
  with "remember me" (sliding), otherwise a browser-session cookie and a 1-day row.
- **Reset tokens**: in `Verification` as `reset-password:<sha256>`, 1 hour, single use, newest
  only; a reset deletes every session of that user.
- **Google** (not offered in the UI: login/sign-up are email + password only; the flow is kept
  for later): OIDC code flow with PKCE and an HMAC-signed state cookie (`AUTH_SECRET`); the ID
  token is verified with jose against Google's JWKS (issuer, audience, `email_verified`). Redirect
  URI is `<APP_URL>/api/auth/callback/google` (through the web proxy).
- **No email verification.** Because of that, linking Google to an existing *unverified* account
  deletes that account's password (someone else may have squatted the address). Don't remove this.
- Rate limit (10/min/IP) on signup, login, forgot/reset/change password and account deletion.
  `trust proxy` is `loopback` (the web proxy is the one trusted hop). `AUTH_RATE_LIMIT=off` only in tests.
- Deleting a password-less account requires a session less than 24 hours old.

## Core model: ledgers

All money data belongs to a **ledger**, never directly to a user.

- Every user has a `PERSONAL` ledger (created at sign-up and on first Google sign-in; self-healed
  in `buildContext`). `SHARED` ledgers are households.
- `LedgerMember` rows are **never deleted** while the ledger exists: leaving sets `leftAt`, deleting
  a user nulls `userId`. Expenses, splits and settlements reference **member ids**; `member.name` is
  a display snapshot.
- Leaving or deleting an account is **blocked while the member's balance is non-zero**
  (`leaveSharedLedger`, `prepareAccountDeletion` in `apps/api/src/services/ledgers.ts`).
- The active ledger is the `ledger` cookie, set by the web app; the API validates it against an
  active membership on every request and falls back to the personal ledger.

## API rules (apps/api)

- Routes use `requireAuth` or `requireLedger` (`src/middleware/context.ts`); read the context with
  `getAuth(req)` / `getCtx(req)`. Readers in `src/services/data.ts` take the context; never accept a
  ledger/user id from the client.
- Every write is scoped: `where: { id, ledgerId: ctx.ledger.id }` (`updateMany`/`deleteMany`/
  `findFirst`), and referenced ids (category, payer, split members) are checked to belong to the
  same ledger. Owner-only operations check `ctx.isOwner`.
- Responses: data on success, `{ ok: true, id? }` for mutations; errors via `HttpError`
  (`src/http.ts`): `invalid(fieldErrors)` → 400 `{ ok:false, fieldErrors }`, others
  `{ ok:false, error }`. Validate with zod and report **every** field's error at once.
- Express 5 forwards rejected promises to the error handler: just `throw`.
- Slow side effects (budget alerts, file deletion) go through `defer()` (`src/logger.ts`).
- Read env only through `src/env.ts` (zod-validated). The API port is `API_PORT`, not `PORT`
  (the web app shares the `.env` and `next start` reads `PORT`).
- Imports inside the API use `.js` suffixes (ESM).

## Money and dates (packages/shared)

- Amounts are **integer hundredths** of the ledger currency (`money.ts`): parse with
  `parseAmount` (string-based), format with `formatMoney`. **Sum in JS**: Prisma `Int`
  aggregates are 32-bit.
- Splits use `equalSplit`; custom splits must add up exactly.
- Expense/income dates are Postgres `DATE` (UTC midnight). Use the UTC helpers in `dates.ts`.
  "Today" is `ctx.today` (user's time zone); in the browser `todayInput()`. Store time zones via
  `normalizeTimeZone`.
- JSON has no Date: `apps/web/src/lib/api.ts` revives known date keys. Add new date fields to
  `DATE_KEYS` there.

## Web rules (apps/web)

- No database access and no secrets (only `API_URL`). Data comes from
  `@/lib/data` and `@/lib/session` (`requireLedger()`, cached per request; 401 → `/login`).
- Next.js 16 with Cache Components: request-dependent rendering sits inside `<Suspense>`; don't
  call `new Date()` before awaiting request data; `useSearchParams()` needs its own `<Suspense>`
  (or read `window.location.search` in handlers). No functions passed from server to client
  components. `"use server"` files export only async functions.
- Auth forms call the API from the browser via `@/lib/auth-api` (`/api/auth/*`). There is no
  Google button; if one is added back, it must be a full navigation to `/api/auth/google`.
- `src/proxy.ts` only checks that a `session` cookie exists, for redirects. Never security.

## Database and Prisma (apps/api/prisma)

- Edit `schema.prisma`, then `npm run db:migrate -- --name <change>`; use `--create-only` when a
  migration needs data changes or a rename (non-interactive shells can't answer Prisma's prompt).
- `prisma generate` runs on install and build; client output `apps/api/src/generated/prisma`
  (never edit).
- **Never run `prisma migrate reset`** or other destructive commands; Prisma blocks them for AI
  agents and they need the user's explicit consent. Tests use `migrate deploy`.

## Features with invariants

- **Recurring** (`services/recurring.ts`): materialized up to today on read via `syncRecurring`;
  `(recurringId, date)` is unique, so it's idempotent (catch `P2002`, `skipDuplicates`).
- **Budget alerts** (`services/budget-alerts.ts`): one `BudgetAlert` row per
  ledger/scope/month/threshold = "already sent". Trigger after any change to a month's spending.
- **Receipts** (`services/receipts.ts`, `routes/receipts.ts`): type from magic bytes, stored outside
  any public folder, served only to ledger members with `nosniff` + sandboxing CSP; delete files
  with their expense/ledger (`deleteLedgerAndFiles`).
- **CSV**: export quotes every cell and prefixes `= + - @` with `'`; import previews and checks
  duplicates (`date|amount|description`) before inserting.
- **Redirect targets** from the URL go through `safeRedirect`.
- **Email**: no provider. `sendEmail` logs to the console and writes `.outbox/*.json` atomically in
  dev/tests. Invites are shared by copying the link. Email never throws into a request.

## UI conventions (apps/web)

- Forms: client components with `onSubmit` + `useTransition`, calling a server action that returns
  `ActionResult`; focus the first `[aria-invalid=true]`. Use `Field`, `TextInput`, `AmountInput`,
  `PasswordInput`, `FormAlert`, `buttonStyles`, `selectClass`/`selectBase`.
- Modals use `components/dialog.tsx` (native `<dialog>`; Escape via synchronous `cancel`; ignores
  its own async `close` events). Don't regress that.
- Dashboard client components read ledger data via `useLedgerUI()`; **N** opens add-expense.
- Lists that open an edit dialog track the **id** and look the row up from fresh props.
- Category colors are palette slots (`COLOR_SLOTS`, `--series-*`), validated for color blindness;
  status colors are reserved and paired with icon + text. Charts: one axis, legend for 2+ series,
  hover **and** keyboard tooltips, a table view. Dark mode via `data-theme` set before paint.
- Accessibility: labelled inputs, `aria-describedby`, `role="alert"` for errors, visible focus,
  no horizontal scroll at 390px.

## Tests (tests/e2e)

- Each test creates its own users (`uniqueEmail`), so specs run in parallel on a shared test DB.
  Emails are read from `test-results/outbox` (`waitForEmail`, `linkIn`).
- `api-security.spec.ts` hits the API directly: cross-user access, forged ledger cookie, logout
  revocation, reset semantics, OAuth state. Extend it with every new endpoint.
- The browser runs in UTC; use the UTC helpers. Wait for `networkidle` before keyboard shortcuts
  or file inputs.

## Secrets and git

- `.env` (root) holds real secrets and is git-ignored; keep `.env.example` in sync.
- Not committed: `.env`, `.claude/`, `.outbox/`, `storage/`, `dist/`, `.next/`, `test-results/`,
  `playwright-report/`, `src/generated/`, `node_modules/`.
- Commit as the repo's configured user. Push over SSH (`github-hardikshubham31` host alias).
  Never put tokens in remotes, config files or saved commands.
