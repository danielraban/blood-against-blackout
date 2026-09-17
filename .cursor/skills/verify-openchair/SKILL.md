---
name: verify-openchair
description: Verifies OpenChair changes with proportional unit, browser, accessibility, build, preview, and data-quality checks. Use when finishing a feature, preparing a pull request, or investigating a QA failure in this repository.
---

# Verify OpenChair

## Choose checks from the diff

1. Inspect changed files and identify affected user flows and boundaries.
2. Run the narrowest relevant check first:
   - `src/lib/**`: `npm test`
   - TypeScript or Next.js code: `npm run lint` and `npm run typecheck`
   - `src/app/**`, `src/components/**`, `src/lib/idb.ts`, or `public/sw.js`:
     `npm run test:e2e`
   - Build, routing, environment, or dependency changes: `npm run build`
3. Before a pull request, run `npm run check`. Also run `npm run test:e2e`
   when browser-facing files changed.

## Protect deterministic tests

- Do not use production or shared Neon data in pull-request tests.
- Mock application APIs, public feeds, maps, geolocation, and clocks where they
  would make browser tests flaky.
- Never display environment variable values.

## Diagnose live failures

- For a failed Vercel preview check, inspect deployment status, build logs, and
  runtime errors with the connected Vercel integration when available.
- If `/api/health` reports database unavailability, use the connected Neon
  integration for read-only project, branch, endpoint, and query inspection.
- Do not mutate, migrate, reset, or restore a database during verification.
- Run `npm run audit` only when a staging `DATABASE_URL` is intentionally
  configured.

## Report

List each command or live check with pass, fail, or skipped status. Explain every
skip and distinguish code failures from missing credentials or unavailable
external services. Do not claim completion while a relevant check is failing.
