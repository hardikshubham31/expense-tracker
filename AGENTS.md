<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Expense Tracker: guide for coding agents

Personal and shared (household) expense tracking. Read this before changing code; the README covers
features and setup for humans.

## Stack

- **Next.js 16** App Router with `cacheComponents` and `partialPrefetching` on (`next.config.ts`), Turbopack, React 19
- **Better Auth 1.7** (email/password + optional Google) with the Prisma adapter, `src/lib/auth.ts`
- **Prisma 7.10** + **PostgreSQL 17** (Docker), driver adapter `@prisma/adapter-pg`, client generated to `src/generated/prisma`
- **Tailwind CSS 4**, **zod 4**, **Playwright** for end-to-end tests
- Stay on **Prisma 7**: Better Auth's adapter doesn't support Prisma 8 yet

## Commands

```bash
docker compose up -d        # Postgres on 127.0.0.1:5432 (dbs: expense_tracker, expense_tracker_test)
npm run dev                 # http://localhost:3000
npm run build && npm start  # production build
npx tsc --noEmit && npm run lint
npm run db:migrate          # prisma migrate dev (creates + applies a migration)
npm run build && npm run test:e2e   # Playwright against :3100 + expense_tracker_test
```

Run `tsc`, `lint`, `build` and the e2e suite before calling a change done. The suite must pass
repeatedly, not just once; fix flakiness at its cause.

## Layout

```
src/
  proxy.ts                 Optimistic cookie check: redirects only, never the real auth check
  app/(auth)/              login, signup, forgot/reset password (static pages + client forms)
  app/dashboard/           Signed-in app. layout.tsx provides ledger data via LedgerProvider
    actions/*.ts           Server actions ("use server"), one file per area
    _components/           Dashboard-only client components (dialogs, charts, lists)
    <page>/page.tsx        Server pages; dynamic parts sit inside <Suspense>
  app/invite/[token]/      Accept a household invite
  app/api/                 auth handler, CSV export, receipts upload/serve, account export
  components/              Shared UI: dialog, menu, ui (buttons/cards), auth form pieces, theme
  lib/                     Server and shared logic (see below)
prisma/schema.prisma       Data model; migrations in prisma/migrations
tests/e2e/                 Playwright specs + helpers (outbox reader, signUp, addExpense)
```

## Core model: ledgers

All money data belongs to a **ledger**, never directly to a user.

- Every user has a `PERSONAL` ledger (created in Better Auth's `databaseHooks.user.create.after`).
  `SHARED` ledgers are households with several members.
- `LedgerMember` rows are **never deleted** while the ledger exists. Leaving sets `leftAt`;
  deleting a user nulls `userId`. Expenses, splits and settlements point at **member ids**, and
  `member.name` is a display snapshot.
- Leaving a household or deleting an account is **blocked while the member's balance is non-zero**
  (`leaveSharedLedger`, `prepareAccountDeletion` in `src/lib/ledgers.ts`).
- The active ledger is the `ledger` cookie, validated against an active membership.

## Rules that keep the app correct

### Authorization (do not bypass)

- **Every** server read goes through `requireLedger()` / `requireUser()` (`src/lib/session.ts`,
  `React.cache`-deduped). Readers in `src/lib/data.ts` resolve the ledger themselves; never add a
  reader that takes a `ledgerId`/`userId` argument from the caller.
- **Every** server action re-authenticates and scopes writes with `where: { id, ledgerId: ctx.ledger.id }`
  (`updateMany`/`deleteMany`/`findFirst`), and checks that referenced ids (category, payer, split
  members) belong to the same ledger.
- Owner-only operations check `ctx.isOwner`. Route handlers check the session and return 401
  instead of redirecting.
- `src/proxy.ts` is only an optimistic redirect. Never rely on it for security.

### Money and dates

- Amounts are **integer hundredths** of the ledger currency, for every currency (`src/lib/money.ts`).
  Parse user input with `parseAmount` (string-based, no float math); format with `formatMoney`.
  Only currencies with at most 2 minor digits are offered.
- **Sum in JavaScript**, not Prisma `_sum`: Prisma `Int` aggregates are 32-bit.
- Splits use `equalSplit` (leftover hundredths go to the first members); custom splits must add up
  exactly to the total.
- Expense/income dates are Postgres `DATE`, read back as UTC midnight. Use the UTC helpers in
  `src/lib/dates.ts`. "Today" is `ctx.today` (the user's time zone via `todayIn`); in the browser
  use `todayInput()`. Store time zones through `normalizeTimeZone` (modern IANA names).

### Next.js 16 with Cache Components

- Anything that reads cookies/headers/`searchParams` (which is all signed-in data) must render
  inside `<Suspense>`. Pages follow the pattern: a sync `export default` that renders
  `<Suspense fallback={…}><Inner searchParams={searchParams} /></Suspense>`.
- Don't call `new Date()` in a server component before awaiting request data (`requireLedger()` or
  `searchParams`). Prefer `ctx.today`.
- `useSearchParams()` in a client component needs its own `<Suspense>`. For values only needed on
  submit, read `window.location.search` in the handler instead (keeps the page static).
- After mutations, call `refresh()` from `next/cache` in the action. Run slow side effects
  (budget alerts, file deletion) with `after()` from `next/server`.
- Server components can't pass functions to client components (no render props across the boundary).
- A `"use server"` file may only export async functions: put constants and helpers in `src/lib/`
  (e.g. `MAX_IMPORT_ROWS` lives in `src/lib/csv.ts`). Types are fine.
- Route types are generated: use the global `PageProps<"/route">`, `LayoutProps<"/route">` and
  `RouteContext<"/api/…">` helpers (run `npx next typegen` if `tsc` can't find them).
- Runtime file paths (receipts) use `/*turbopackIgnore: true*/` so Turbopack doesn't trace the project.

### Database and Prisma

- Change `prisma/schema.prisma`, then `npm run db:migrate -- --name <change>`. Migrations that
  need data changes can be created with `--create-only` and edited before applying.
- Prisma 7 doesn't generate on migrate: run `npx prisma generate` (also runs on `npm install`).
- **Never run `prisma migrate reset`** or other destructive commands yourself; Prisma blocks them
  for AI agents, and they need the user's explicit consent. The test setup uses `migrate deploy`.
- Don't edit `src/generated/`.
- Better Auth core models (`User`, `Session`, `Account`, `Verification`) follow its schema; extra
  user fields must also be declared in `user.additionalFields` in `src/lib/auth.ts`.

### Features with invariants

- **Recurring rules** (`src/lib/recurring.ts`) are materialized on page load up to today by
  `syncRecurring()` in `data.ts`. The unique `(recurringId, date)` index makes this idempotent;
  keep it that way (catch `P2002`, use `skipDuplicates`).
- **Budget alerts** (`src/lib/budget-alerts.ts`): one `BudgetAlert` row per
  ledger/scope/month/threshold is the "already sent" marker. Trigger `checkBudgetAlerts` via
  `after()` whenever spending in a month changes.
- **Receipts** (`src/lib/receipts.ts`): type comes from magic bytes, never the browser; stored
  outside `public/` and served only to ledger members with `nosniff` and a sandboxing CSP.
  Deleting an expense or ledger must also delete its files (`deleteLedgerAndFiles`).
- **CSV export** quotes every cell and prefixes `= + - @` with `'` (formula injection).
  **CSV import** previews and checks duplicates (`date|amount|description`) before inserting.
- **Redirect targets** from the URL go through `safeRedirect` (`src/lib/redirect.ts`).
- **Email**: no provider. `sendEmail` (`src/lib/email.ts`) prints to the console and, in dev/tests,
  writes `.outbox/*.json` atomically. Sign-up has no email verification. Invites are shared by
  copying the link. Email must never throw into the request that triggered it.

## UI conventions

- Forms are client components using `onSubmit` + `useTransition` calling a server action that
  returns `ActionResult` (`src/lib/action-utils.ts`). Validate with zod and **report every field's
  error at once**; focus the first `[aria-invalid=true]`. Use `Field`, `TextInput`, `AmountInput`,
  `PasswordInput`, `FormAlert`, `buttonStyles`, `selectClass`/`selectBase`.
- Modals use `src/components/dialog.tsx` (native `<dialog>`). It closes Escape through `cancel`
  synchronously and ignores its own async `close` events. Don't regress that, or quick reopen breaks.
- Dashboard client components read ledger data from `useLedgerUI()`; open the add-expense dialog
  with `openAddExpense()` (the **N** shortcut lives in `ledger-context.tsx`).
- Lists that open an edit dialog track the **id** being edited and look the row up from fresh props.
- Colors: zinc neutrals, emerald accent. Category colors are **palette slots** (`COLOR_SLOTS`,
  CSS vars `--series-*` in `globals.css`), validated for color blindness in light and dark; assign
  in order, never generate new hues. Status colors (`--status-*`, `text-good`, `text-critical`)
  are reserved for state and always paired with an icon + text.
- Charts are hand-built HTML/SVG: one axis only, thin marks, legend when there are 2+ series,
  hover **and** keyboard tooltips, and a "View as table" fallback.
- Dark mode: `data-theme` on `<html>` set before paint by the inline script in
  `src/components/theme.tsx`; Tailwind's `dark:` variant targets `[data-theme="dark"]`.
- Accessibility basics: labelled inputs, `aria-describedby` for hints/errors, `role="alert"` for
  errors, visible `focus-visible` outlines, no horizontal scroll at 390px wide.

## Tests

- Specs in `tests/e2e/` create their own users with unique emails (`uniqueEmail`), so they run in
  parallel against a shared test database. Read emails with `waitForEmail` / `linkIn`.
- The browser runs in UTC (`timezoneId`); use the UTC date helpers in `tests/e2e/helpers.ts`.
- Wait for hydration (`waitForLoadState("networkidle")`) before keyboard shortcuts or file inputs.
- Add or update a spec with every user-facing change.

## Secrets and git

- `.env` holds real secrets and is git-ignored; keep `.env.example` in sync with placeholder values.
- Not committed: `.env`, `.claude/`, `.outbox/`, `storage/`, `test-results/`, `playwright-report/`,
  `src/generated/`, `node_modules/`.
- Commit as the repo's configured user (`git config user.email`). Never put tokens in remotes,
  config files or commands that get saved.
