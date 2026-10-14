# Rivals Fantasy

Fantasy esports in one site. Wave 1 launches with Marvel Rivals: draft real pros by role, run a private league with friends, and score every week from the real pro season (Marvel Rivals Ignite 2026). The data model is game-agnostic; Deadlock is registered as a watched game and its section opens when its pro scene exists.

Working repo only. Not deployed. See `ARCHITECTURE.md` for the design and `RESEARCH.md` for the sourced ground truth behind every roster, date and scoring value.

## Run it locally

```sh
npm run build        # compiles db/seed-data into data/v1/*.json
npm run dev          # http://localhost:4173, embedded SQLite, seeds on boot
npm run seed         # adds a demo league (4 managers, invite code printed)
npm run test:loop    # the full-loop proof over HTTP on a throwaway DB
```

Sign in locally either with an email account you create, or with the dev provider (`RF_DEV_AUTH=1 npm run dev`, then "Continue with Dev account"). Google and X sign-in are wired and activate when production OAuth credentials exist (a parked deploy-time step, see `ARCHITECTURE.md`).

Demo accounts from `npm run seed`: `commish@demo.rivals.gg` / `demo-password-1` (plus managers 2 to 4 with matching passwords, and `admin@demo.rivals.gg` / `demo-admin-password`).

## The loop test

`npm run test:loop` boots the dev server on a throwaway database and proves the whole product over real HTTP: dev OAuth sign-in, four email sign-ups, a league created for the live competition, three invite joins, a full 36-pick snake draft (32 players plus the Squad round), week-1 lineups, a labelled demo results import through the real import API, three scored weeks with moving standings, seeded playoffs, a final, and a completed league with a champion. 40 checks.

## Layout

- `api/`: 17 serverless functions (auth, leagues, admin import, health). Counted in `LIVE_CHECKLIST.md`.
- `lib/`: db adapters (Neon Postgres or embedded SQLite), auth, OAuth, scoring, league engine, draft engine, schema, seed loader.
- `db/seed-data/`: the curated, source-noted dataset (games, competitions, teams, players).
- `data/v1/`: build output. Static-first public layer.
- `scripts/`: build, dev server, demo seeder, loop test.

## Env vars (never committed)

`DATABASE_URL` (optional; without it, local SQLite), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `OAUTH_REDIRECT_BASE`, `ADMIN_IMPORT_KEY`, `RF_DEV_AUTH` (local only), `RF_DB_PATH`, `PORT`.
