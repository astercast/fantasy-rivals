# LIVE_CHECKLIST.md: Rivals Fantasy

Status: **not deployed.** Working repo only (two-track rule). This checklist is written at wave 1 so the deploy, when the user orders it, is a checklist execution and not a design session. Free-tier audit below assumes Vercel Hobby plus Neon free tier.

## Functions (17, all explicit paths, each {"maxDuration": 10}, no runtime pinned)

| Function | Purpose |
| --- | --- |
| api/health.js | Health probe (db kind, provider config state) |
| api/auth/signup.js | Email sign-up (fallback path) |
| api/auth/login.js | Email sign-in |
| api/auth/logout.js | Session end |
| api/auth/me.js | Current user + provider configuration state |
| api/auth/oauth-start.js | OAuth redirect (Google, X, dev) |
| api/auth/oauth-callback.js | OAuth code exchange, linking, session |
| api/leagues/meta.js | Competition picker data + defaults |
| api/leagues/index.js | List my leagues / create a league |
| api/leagues/join.js | Join by invite code |
| api/leagues/invite.js | Mint an invite code |
| api/leagues/get.js | League room payload |
| api/leagues/draft.js | Draft state, start, pick |
| api/leagues/lineup.js | Lineup read/save with week locks |
| api/leagues/standings.js | Table, matchups, weekly score detail |
| api/leagues/score-week.js | Score a week, seed playoffs |
| api/admin/import-results.js | Results ingestion (admin or import key) |

Fleet rules honored: static data lives in `data/v1/`, never under `api/`; no `.js` data files under `api/`; every `vercel.json` functions entry carries a valid property; builds are Standard machines only (fleet rule), `buildCommand` is `node scripts/build-site.mjs`.

## Free-tier ceilings

- **Vercel Hobby:** 100 GB bandwidth, function execution capped at 10s (all functions here are far under in practice), 100 GB-hours. The public layer is static files plus precomputed JSON, so nearly all read traffic never touches a function.
- **Neon free tier:** 0.5 GB storage, autoscaling compute with idle suspend, 100 CU-hours class limits. The dataset is tiny (about 98 players, low thousands of stat rows per season). A season of a few hundred leagues is well inside this.
- **Locally:** no tiers at all. Embedded SQLite; the only dependency is optional.

## Honest estimates (friends-scale launch)

- A 12-team league drafting live: roughly 200 function calls for the whole draft (state polls included), each a handful of indexed queries.
- Scoring a week for the whole site is commissioner-triggered per league, not a cron: no background invocation burn.
- Static pages and `data/v1` reads dominate real traffic and are CDN-served.

## First degradation point, named in advance

Draft state and score-week are the chatty paths. `scoreWeek` runs one query per lineup row and per squad claim, and draft reads re-fetch the full pool. At roughly 100 leagues scoring in the same hour, the 10s Hobby ceiling is not the wall; Neon's connection behavior under burst is. The fix, when it matters, is batching score writes and caching draft pool reads per league, both contained in `lib/`. Nothing about the public layer degrades: it is static.

Second named point: OAuth state nonces live as rows in `events`. At real scale they belong in their own table with an expiry sweep. Harmless at launch scale, noted so nobody is surprised.

## Pre-push checklist (when the user orders it)

1. Create the Neon project; set `DATABASE_URL`.
2. Register the OAuth apps (Google Cloud, X developer); set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `OAUTH_REDIRECT_BASE`, and a strong `ADMIN_IMPORT_KEY`.
3. Set `RF_DEV_AUTH` to nothing (dev provider off) in the production env.
4. Run `npm run build`; confirm `data/v1` regenerated with a fresh `asOf`.
5. Smoke the live URL: health, season band state, signup, create league, invite join, draft start.
