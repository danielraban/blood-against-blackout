# blood against blackout

Privacy-first web app for finding A.A., N.A., and C.A. meetings. Independent — not affiliated with fellowship World Services offices or the Meeting Guide app.

Meeting data comes from public [Meeting Guide JSON](https://github.com/code4recovery/spec) / TSML feeds. Your GPS stays on this device. The server only sees a coarse geohash or city slug.

## Setup

1. Copy `.env.example` to `.env.local` and set every value. Generate unique 32-byte-or-longer values for `ADMIN_SESSION_SECRET` and `CRON_SECRET`.
2. `npm install`
3. `npm run db:migrate` for a new database. Existing pre-migration databases should use `npm run db:push` once, then use migrations going forward.
4. `npm run ingest` (or sign in at `/admin/feeds` and click Run ingest)
5. `npm run dev`

If `next dev` 404s every route, leftover file watchers are usually the cause. Stop old Node processes, raise the open-file limit, then start again:

```bash
kill $(lsof -ti :3000) 2>/dev/null
ulimit -n 10240
npm run dev
```

Optional: `npm run sample` loads the bundled San Jose sample into Neon. `npm run discover` tries known intergroup hosts for open TSML feeds.

## Scripts

- `npm run dev` — Turbopack
- `npm run build` — webpack production build (required for the Serwist service worker)
- `npm run db:migrate` — apply checked-in Drizzle migrations
- `npm run ingest` — pull public feeds into Neon and rebuild the city index
- `npm run discover` — probe TSML hosts (including UK intergroups) and add working public feeds
- `npm run sample` — load the bundled San Jose sample feed (useful when ingest cannot reach the public web)

There is no single national AA feed. blood against blackout uses the same public Meeting Guide / TSML JSON endpoints local offices publish. The UK General Service Office meeting finder is not a public TSML feed; UK coverage comes from intergroups and the Continental European Region when those feeds are open.

## Vercel production

1. Create a Vercel project from this repository and provision or connect Neon.
2. Add all variables from `.env.example` to Preview and Production. Restrict the MapTiler key to those origins.
3. Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin and redeploy.
4. Run `npm run db:migrate`, then `npm run ingest`, against the production Neon branch.
5. Deploy a preview and verify `/api/health` returns `{"ok":true}`.
6. Promote the verified preview. `vercel.json` runs a bounded nightly ingest; Vercel sends `CRON_SECRET` as its bearer token.

Never commit `.env.local`. The admin cookie is signed and expires after seven days. Opening the optional map sends the visible map area and standard request metadata to MapTiler.
