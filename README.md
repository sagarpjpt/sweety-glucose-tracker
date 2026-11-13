# Sweety

**Live demo:** https://sweety-glucose-tracker-taupe.vercel.app/

Demo login: `demo@sweety.example` / `DemoPass123!` (synthetic data only).

A personal blood glucose record, built for the Kenpath Junior Full Stack Developer assessment. React + Express + PostgreSQL. No MongoDB: the brief's explicit database requirement is PostgreSQL.

![Daily notebook](docs/screenshots/daily.jpg)

## Run with Docker

Requires Docker Engine with Compose.

```sh
docker compose up --build -d
docker compose exec app npm run db:seed
```

Open http://localhost:3001. Demo login: **demo@sweety.example** / **DemoPass123!**. These credentials are for synthetic demonstration data only. Or register a new account.

Stop with `docker compose down`. The named database volume survives restarts. The Compose passwords and development cookie settings are for a local demo, not internet deployment.

## Run locally

Requires Node.js 24 and PostgreSQL 18 (the Docker database works too).

```sh
npm ci
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env
# Adjust DATABASE_URL if using an existing database.
docker compose up db -d
npm run db:migrate
npm run db:seed
npm run dev
```

Client: http://localhost:5173. Express: http://localhost:3001. Vite proxies `/api` to Express, so cookies stay on the same origin. Start separately with `npm run server` and `npm run client` if preferred.

For a production build: `npm run build` then `npm start`. Express serves the compiled React app. Set `NODE_ENV=production` behind HTTPS; cookies then require HTTPS. Use real database credentials and do not seed a public production instance with the demo account.

## Deploy to Vercel

The Vite frontend and Express API deploy together under one HTTPS domain. `api/index.js` exports the existing Express app; `vercel.json` routes `/api/*` to that function and serves the Vite build from `dist`. No Docker runtime is needed on Vercel.

1. Import this repository into Vercel. Use the repository root, Vite framework, Node 24, install command `npm ci --include=dev`, build command `npm run build`, and output directory `dist`.
2. Provision a dedicated PostgreSQL database through the Neon integration (or connect an existing database). Use its pooled SSL connection string as the server-only `DATABASE_URL`.
3. Set `NODE_ENV=production` and `APP_TIMEZONE=Asia/Kolkata`. Do not set `SWEETY_QA_DATABASE`, `PORT`, or any `VITE_` database variable. Use a separate database/branch for Preview deployments rather than sharing production data.
4. Pull the intended environment into an ignored local env file, then run the migration once against that new database. For example, after linking the correct Vercel project, `vercel env pull .env.production.local --environment=production`, then `node --env-file=.env.production.local server/migrate.js`.
5. For a synthetic-data showcase only, run `node --env-file=.env.production.local server/seed.js`. The published demo credentials are intentional; do not put real patient records in that account.
6. Deploy Production and verify registration, login persistence on refresh, CRUD, reports, logout and account isolation on the actual HTTPS URL. Inspect function logs if any API request fails.

The global PostgreSQL pool is capped at five connections per instance, with idle connection management through `@vercel/functions`. The existing login limiter is in-memory and therefore per instance; a production service should use a shared limiter or platform rate limiting. Deployment success still needs verification against the actual provisioned database.

## Tests

```sh
npm test
npm run build
npm run format:check
```

Tests start a disposable **real PostgreSQL 18.1** cluster using `embedded-postgres` on port 15439. They do not touch `DATABASE_URL` or your application database. Run as a non-root user on a platform supported by embedded-postgres. A fresh temporary data directory is removed after testing.

Coverage includes hashed passwords, authentication failures, private CRUD, validation boundaries, concurrent slot conflicts, edit collisions, daily/month-to-date/previous-month aggregation, empty reports, leap-year/year boundaries, pagination, origin protection and logout.

## Features

- Registration, bcrypt password hashing and server-side sessions with hashed random tokens, HTTP-only cookies and a seven-day expiry.
- Add, edit, delete and list readings. Four named slots. Whole values from 40 to 600 mg/dl. Clear form errors and deletion confirmation.
- A database unique constraint on `(user_id, date, slot)` enforces both one reading per slot and at most four per day, including concurrent requests. Every data query is scoped to the authenticated user.
- Daily, month-to-date and previous-calendar-month reports with count, min, max and average rounded to one decimal. Daily reports list all four slots, including missing entries.
- Bonuses: paginated ledger, actual daily-average bar charts, Docker setup. Fonts are bundled locally; no external font request is required.

## API

All routes are prefixed with `/api`. POST/PUT/DELETE requests require `X-Sweety-Request: 1`. JSON bodies only. The client sends this header; no permissive CORS policy is enabled.

| Method | Path           | Body / parameters                             |
| ------ | -------------- | --------------------------------------------- |
| POST   | /auth/register | name, email, password                         |
| POST   | /auth/login    | email, password                               |
| GET    | /auth/me       | profile, application date and timezone        |
| POST   | /auth/logout   | revoke current session                        |
| GET    | /readings      | page=1, limit=20 (maximum 100)                |
| POST   | /readings      | date: YYYY-MM-DD, slot: 0–3, value: integer   |
| PUT    | /readings/:id  | full reading body                             |
| DELETE | /readings/:id  | delete own reading                            |
| GET    | /reports       | date: YYYY-MM-DD, type: daily / mtd / monthly |

Slots: 0 = Morning (fasting), 1 = After breakfast, 2 = After lunch, 3 = After dinner. Errors return `{ "error": "message" }` with an appropriate HTTP status.

## Environment

`.env.example` lists the normal application variables. `DATABASE_URL` is required; `PORT` defaults to 3001, `APP_TIMEZONE` to Asia/Kolkata, `NODE_ENV` to development. `DEMO_PASSWORD` is used only when initially creating the demo account. Rerunning the seed adds missing sample readings without resetting an existing password or overwriting readings.

For internal browser QA only, `SWEETY_QA_DATABASE=1` starts an embedded disposable-data preview database through `npm run dev`; it also requires `DATABASE_URL=postgres://postgres:preview_local@localhost:15438/postgres`. Do not use this mode for real records. The normal setup uses PostgreSQL or Docker, not this helper.

## Notes

- Dates are calendar dates in `APP_TIMEZONE`, defaulting to India. Future-date validation uses that timezone on the server. The monthly report means the complete month before the selected reference date, exactly as in the brief.
- An empty report has zero count and null summary values. The UI shows an empty message rather than invented zeros.
- The visual direction is a paper notebook: serif numerals, monospace labels, muted olive, red ink and ruled tables. The chart displays recorded daily averages with a fixed 0–600 scale. It provides no clinical categories or diagnosis.
- More time: password reset/email verification, CSRF token defense in depth, accessibility focus trapping in the confirmation dialog, session cleanup scheduling, frontend interaction tests, and a configurable per-user timezone. Redis, BullMQ and doctor roles were left out to keep the required behavior easy to inspect.
- This is an assessment implementation, not a medical device. Use synthetic data when evaluating it.
- Built with AI assistance; implementation and verification are documented rather than represented as unaided work.

## Screenshots

- [Daily report and entry form](docs/screenshots/daily.jpg)
- [Previous month report](docs/screenshots/monthly.jpg)
- [Validation error](docs/screenshots/validation.jpg)
