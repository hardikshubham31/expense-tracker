# Expense Tracker

Track personal spending, budgets and income, and share expenses with a household.

- **`apps/api`**: Node.js + Express 5 backend. Hand-written authentication, Prisma 7 + PostgreSQL, all business logic.
- **`apps/web`**: Next.js 16 frontend (UI only; talks to the API).
- **`packages/shared`**: money, dates, CSV, splits and category helpers used by both.

## Getting started

```bash
docker compose up -d   # Postgres 17 on localhost:5432 (also creates expense_tracker_test)
npm install            # installs every workspace and generates the Prisma client
cp .env.example .env   # then set AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate     # apply migrations
npm run dev            # API on :4000, web on http://localhost:3000
```

Both apps read the single `.env` at the repo root.

Production: `npm run build && npm start` (runs both).

### How the pieces talk

```
browser ──► web (Next.js, :3000) ──/api/* proxy──► API (Express, :4000) ──► Postgres
                 │ server components and actions ──────────▲
```

The browser only talks to the web app. `/api/*` is forwarded to Express, so the session cookie
is first-party and there's no CORS to configure. Pages render on the server by calling the API
with the visitor's cookies.

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
| Households | ledger menu → *New household* | Shared ledger: invite link, who paid, equal or exact splits |
| Balances | `/dashboard/balances` | Who owes whom, suggested fewest payments, payment history |
| Settings | `/dashboard/settings` | Ledger currency and overall budget; members and invites |
| Account | avatar menu → *Account settings* | Name, time zone, budget alerts, theme, password, data export (JSON), delete account |

Press **N** anywhere on the dashboard to add an expense.

## Authentication

Written by hand in `apps/api/src/auth` using Node's built-in crypto (no auth library):

- **Passwords** are hashed with scrypt (random salt, memory-hard) and compared in constant time.
- **Sessions** are random 256-bit tokens in an httpOnly cookie; the database stores only a
  SHA-256 hash of each token. Logging out deletes the session server-side.
- **Password reset** links are single-use, expire after an hour, and sign you out everywhere.
- **Google sign-in** uses the OpenID Connect code flow with PKCE and a signed state cookie; the
  ID token is verified against Google's published keys.
- **Rate limiting** on sign-up, login and password endpoints (10 per minute per IP).

Sign-up doesn't verify email addresses (there's no email provider yet).

### Google sign-in

1. Create an OAuth client at <https://console.cloud.google.com/apis/credentials>.
2. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, then restart.

## Email

No provider is configured, so nothing is actually delivered:

- **Password reset:** the link is printed in the API's terminal (and `apps/api/.outbox/` in development).
- **Household invites:** owners copy the invite link from Settings → Members and send it themselves.
- **Budget alerts:** printed to the terminal only.

To send real email, deliver the message in `sendEmail()` in `apps/api/src/services/email.ts`
(SMTP with a Gmail app password works without owning a domain).

## API

All endpoints are under `/api` and use JSON; the session cookie authenticates.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/signup`, `/auth/login`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password` · `DELETE /auth/account` · `GET /auth/session`, `/auth/providers`, `/auth/google`, `/auth/callback/google` |
| Context | `GET /context` (user + active ledger) · `GET /health` |
| Expenses | `GET/POST /expenses` · `PATCH/DELETE /expenses/:id` · `DELETE /expenses/:id/receipt` · `GET /expenses/export` · `GET /expenses/hints` · `POST /expenses/import`, `/expenses/import/duplicates` |
| Money | `GET/POST /income`, `PATCH/DELETE /income/:id` · `GET/POST /recurring`, `PATCH/DELETE /recurring/:id`, `POST /recurring/:id/active` · `POST /settlements`, `DELETE /settlements/:id` |
| Reports | `GET /summary?month=`, `/trends?end=`, `/balances` |
| Categories | `GET/POST /categories` · `PATCH/DELETE /categories/:id` |
| Households | `POST /households` · `GET/PATCH/DELETE /ledger` · `POST /ledger/leave` · `DELETE /ledger/members/:id` · `POST /ledger/invites`, `DELETE /ledger/invites/:id` · `GET /invites/:token`, `POST /invites/:token/accept` |
| Account | `GET/PATCH /account` · `POST /account/timezone` · `GET /account/export` |
| Receipts | `POST /receipts` (multipart) · `GET /receipts/:id` |

Validation errors return `400 { ok: false, fieldErrors }`; other errors `{ ok: false, error }`.

## Tests

```bash
docker compose up -d
npm run build
npm run test:e2e   # starts the API on :4100 and the web app on :3100 against expense_tracker_test
```

Playwright covers sign-up and login, password reset, expenses, receipts, search/export, budgets
and alerts, recurring, income and trends, CSV import, households and splits, account settings,
and an API security spec (cross-user access, forged cookies, session revocation, reset tokens,
OAuth state).

## Deploying

- Run the API (`apps/api`, `npm start`) and the web app (`apps/web`, `npm start`) side by side;
  set `API_URL` on the web app to wherever the API listens.
- Point `DATABASE_URL` at Postgres and run `npx prisma migrate deploy` in `apps/api`.
- Set `APP_URL` to the public web URL and `AUTH_SECRET` to a long random value; serve over HTTPS
  (cookies become `Secure` when `NODE_ENV=production`).
- Add `https://<domain>/api/auth/callback/google` to the Google client.
- Give receipts persistent storage (`RECEIPTS_DIR`), and add an email provider (see Email).
