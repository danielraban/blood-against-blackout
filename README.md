# blood against blackout

Privacy-first web app for finding A.A., N.A., and C.A. meetings. Independent — not affiliated with fellowship World Services offices or the Meeting Guide app.

Meeting data comes from public [Meeting Guide JSON](https://github.com/code4recovery/spec) / TSML feeds. Your GPS stays on this device. The server only sees a coarse geohash or city slug.

## Setup

1. Copy `.env.example` to `.env.local` and set every value. Generate unique 32-byte-or-longer values for `ADMIN_SESSION_SECRET` and `CRON_SECRET`.
2. `npm install`
3. `npm run db:migrate` for a new or existing database. It uses Neon HTTP (the same driver as ingest) and records already-pushed schema so it does not replay `CREATE TABLE`.
4. `npm run ingest` (or sign in at `/admin/feeds` and click Run ingest)
5. `npm run dev`

If `next dev` 404s every route, leftover file watchers are usually the cause. Stop old Node processes, raise the open-file limit, then start again:

```bash
kill $(lsof -ti :3000) 2>/dev/null
ulimit -n 10240
npm run dev
```

Optional: `npm run sample` loads the bundled San Jose sample into Neon. `npm run discover` probes known intergroup hosts, alternate Meeting Guide JSON paths, homepage `Meetings Feed` links, and A.A. Near You websites for open TSML/BMLT feeds.

## Local vs production database

`.env.local` should point `DATABASE_URL` at the Neon branch `local-daniel` (project `open-chair` / `bold-grass-74782708`). Production cron and ingest write only to `main`.

They stay in sync by **resetting the child branch from `main`**, not by pointing local at production or running ingest twice.

```bash
# once: npx neonctl auth
npm run db:sync
```

That discards local writes and copy-on-writes the current production data (schema + meetings + city index). After a reset you do **not** need `db:migrate` or `ingest` unless you are testing those commands.

Rules that keep this from drifting:

1. Apply schema changes on `main` first (`DATABASE_URL` for production, then `npm run db:migrate`), then `npm run db:sync`.
2. Run `npm run ingest` locally only when you are testing ingest. It will diverge from production until the next reset.
3. Never put the `main` connection string in `.env.local`.

## Scripts

- `npm run dev` — Turbopack
- `npm run build` — webpack production build
- `npm run lint` — Next.js and TypeScript lint checks
- `npm run typecheck` — strict TypeScript validation without emitting files
- `npm test` — fast domain and security unit tests
- `npm run test:e2e` — Playwright browser and accessibility smoke tests
- `npm run check` — the local CI gate: lint, typecheck, unit tests, and build
- `npm run audit` — validate meeting data quality against the configured database
- `npm run db:migrate` — apply checked-in Drizzle migrations
- `npm run db:sync` — reset the `local-daniel` Neon branch to production `main`
- `npm run ingest` — pull public feeds into Neon and rebuild the city index
- `npm run discover` — probe TSML hosts (including UK intergroups) and add working public feeds
- `npm run sample` — load the bundled San Jose sample feed (useful when ingest cannot reach the public web)

There is no single national AA feed. blood against blackout uses the same public Meeting Guide / TSML JSON endpoints local offices publish, plus public BMLT root servers for N.A. and the Online Intergroup of A.A. query API for worldwide online A.A. The UK General Service Office meeting finder is not a public TSML feed; UK coverage comes from intergroups and the Continental European Region when those feeds are open.

## Vercel production

1. Create a Vercel project from this repository and provision or connect Neon.
2. Add all variables from `.env.example` to Preview and Production.
3. Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin and redeploy.
4. Run `npm run db:migrate`, then `npm run ingest`, against the production Neon branch.
5. Deploy a preview and verify `/api/health` returns `{"ok":true}`.
6. Promote the verified preview. `vercel.json` runs a bounded ingest every 15 minutes, oldest feeds first; Vercel sends `CRON_SECRET` as its bearer token.

Never commit `.env.local`. The admin cookie is signed and expires after seven days. Opening the optional map sends the visible map area and standard request metadata to OpenFreeMap.

## Quality gates

Run `npm run check` before opening a pull request. Pull requests run the same
lint, typecheck, unit-test, and production-build checks in GitHub Actions, plus
deterministic Playwright smoke tests whose API responses are mocked.

After Vercel finishes a preview deployment, a separate workflow checks the
preview's `/api/health` endpoint against its real environment and Neon
connection. Protected previews return 302 to Vercel Authentication unless GitHub
Actions can send a bypass token: in Vercel go to Project Settings → Deployment
Protection → Protection Bypass for Automation, then add that same value as the
GitHub Actions secret `VERCEL_AUTOMATION_BYPASS_SECRET`. Keep database
migrations, ingest, and `npm run audit` pointed at a staging database; they are
intentionally not part of the pull-request gate.
