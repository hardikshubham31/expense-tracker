# Expense Tracker

Next.js 16 (App Router, Cache Components) · Better Auth · Prisma 7 + PostgreSQL · Tailwind CSS 4

## Getting started

```bash
docker compose up -d   # Postgres 17 on localhost:5432 (also creates expense_tracker_test)
npm install            # also runs `prisma generate`
cp .env.example .env   # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate     # apply migrations
npm run dev            # http://localhost:3000
```

There is no email provider yet. Emails (password reset, household invites, budget alerts) are
printed to the server terminal, and in development also saved as JSON in `.outbox/`. Sign-up
doesn't require email verification.

## Features

| Area | Where | Notes |
| --- | --- | --- |
| Overview | `/dashboard` | Month total, change vs last month, daily average, income and savings rate, daily chart, budgets, categories, recent expenses |
| Expenses | `/dashboard/expenses` | Grouped by day; search, category filter, CSV export, receipts |
| CSV import | `/dashboard/expenses/import` | Auto-matches columns, date format, decimal comma and debit sign; previews duplicates before saving |
| Income | `/dashboard/income` | Feeds "saved" and savings rate |
| Recurring | `/dashboard/recurring` | Weekly / monthly / yearly expenses or income; pause, resume, end date |
| Trends | `/dashboard/trends` | 12 months of spending vs income, per-category view, category comparison |
| Categories | `/dashboard/categories` | Colors from a colorblind-validated palette, monthly budgets |
| Households | ledger menu → *New household* | Shared ledger: invite by email, who paid, equal or exact splits |
| Balances | `/dashboard/balances` | Who owes whom, suggested fewest payments, payment history |
| Settings | `/dashboard/settings` | Ledger currency and overall budget; members and invites |
| Account | avatar menu → *Account settings* | Name, time zone, budget alerts, theme, password, data export (JSON), delete account |

Press **N** anywhere on the dashboard to add an expense. The form suggests a category from the
description (your history first, then keywords) and remembers the last category you used.

## How it works

- **Ledgers.** All money data belongs to a ledger: each user's personal ledger, or a shared household.
  `requireLedger()` in `src/lib/session.ts` resolves the active ledger (cookie) against a real membership;
  every reader in `src/lib/data.ts` and every server action in `src/app/dashboard/actions/` goes through it.
- **Members.** Membership rows are never deleted: leaving sets `leftAt`, so old expenses and balances
  still resolve. Leaving or deleting your account is blocked until your household balances are settled.
- **Money** is stored as integer hundredths of the ledger currency (`src/lib/money.ts`). Sums are done in JS
  because Prisma's `Int` aggregates are 32-bit. Splits distribute leftover hundredths deterministically.
- **Dates** are Postgres `DATE`s. "Today" and "this month" use the user's time zone (detected from the
  browser on first visit, editable in Account).
- **Recurring entries** are materialized on page load up to today (`src/lib/recurring.ts`): no cron needed,
  and a unique `(rule, date)` index makes it idempotent.
- **Budget alerts** run after the response (`after()`), and a `BudgetAlert` row per budget/month/threshold
  guarantees each email is sent once (`src/lib/budget-alerts.ts`).
- **Receipts** are stored on disk outside `public/` (`storage/receipts`, or `RECEIPTS_DIR`), type-checked by
  magic bytes, and served only to ledger members with `nosniff` and a sandboxing CSP. Swap
  `src/lib/receipts.ts` for S3/R2 in production.
- **Theme** is applied by an inline script before first paint (`src/components/theme.tsx`).

## Email

No provider is configured, so nothing is actually delivered:

- **Password reset:** the reset link is printed in the terminal running the server.
- **Household invites:** owners copy the invite link from Settings → Members and send it themselves.
- **Budget alerts:** printed to the terminal only.

To send real email later, deliver the message inside `sendEmail()` in `src/lib/email.ts` (SMTP with a
Gmail app password works without owning a domain), and consider turning email verification back on in
`src/lib/auth.ts`.

## Google sign-in

1. Create an OAuth client at <https://console.cloud.google.com/apis/credentials>.
2. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, then restart (rebuild for `npm start`).

## Tests

```bash
docker compose up -d
npm run build
npm run test:e2e        # Playwright, runs `next start` on :3100 against expense_tracker_test
```

The suite covers auth, expenses, receipts, search/export, budgets and alerts,
recurring, income and trends, CSV import, households and splits, and account settings. It reads
emails from `test-results/outbox`. Setup only applies migrations to the test database (it doesn't
wipe it); every test creates its own users.

## Deploying

- Point `DATABASE_URL` at your Postgres and run `npx prisma migrate deploy`.
- Set `BETTER_AUTH_URL` to your public URL and add `https://<domain>/api/auth/callback/google` to the Google client.
- Give receipts persistent storage (`RECEIPTS_DIR` or object storage), and add an email provider (see Email).
