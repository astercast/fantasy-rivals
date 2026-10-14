# ARCHITECTURE.md: how Rivals Fantasy is built

Wave 1, October 2026. Working repo only. Nothing here is deployed; see the two-track note at the bottom.

## Shape

Static-first public layer, live database only for user and league state.

- Public content (season hub, teams, players, schedule, scoring tables) is compiled at build time from the curated dataset in `db/seed-data/*.json` into `data/v1/*.json` by `scripts/build-site.mjs`. Competition state (live, next, complete) is computed from dates at build time and stamped with `generatedAt` and `asOf`, so staleness is visible on the surface instead of hidden.
- Everything multi-user (accounts, leagues, drafts, lineups, scoring, standings) is server state in one database behind 17 Vercel-style functions in `api/`. The same functions run locally under `scripts/dev-server.mjs` unchanged.

## Data layer

One SQL dialect, two adapters (`lib/db.js`), chosen by environment:

- `DATABASE_URL` set: Neon Postgres via the serverless driver (the only npm dependency, and it is optional; the site runs without it locally).
- Otherwise: embedded `node:sqlite` at `.data/dev.db` (override with `RF_DB_PATH`). Zero install, zero services, which is what makes the full local loop provable end to end.

Schema lives in `lib/schema.js` (mirrored in `db/schema.sql` for review) and is applied idempotently at boot. IDs are app-generated UUIDs; SQL is dialect-neutral (`?` placeholders, no RETURNING). Every entity is game-scoped (games, seasons, pro teams, players, matches, stats), so a second game is rows, not a rebuild. Deadlock is already a row: status `watching`, no content.

## Accounts (the front door)

Per the user's order, sign-in is one click first:

- **Google and X OAuth are the primary paths.** Authorization-code flow with PKCE, implemented in `lib/oauth.js` with env-only credentials (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `X_CLIENT_ID` and `X_CLIENT_SECRET`, `OAUTH_REDIRECT_BASE`). Account linking is by verified email: whichever door a player uses, they land on one user row. An X identity that returns no email links on provider ID and can attach an email later.
- **Email plus password is the fallback.** Passwords are scrypt-hashed with per-user salts (`lib/auth.js`). Sessions are opaque tokens stored SHA-256-hashed, in an HttpOnly, SameSite=Lax cookie.
- **Dev mode:** with `RF_DEV_AUTH=1`, a clearly marked dev provider signs in as a fixed local identity. It exists so the whole loop (sign up, league, draft, scoring) is provable locally before any production OAuth app exists. It cannot be enabled by accident in production config because the flag is read from env only and the login page only renders the button when the API reports the provider configured.
- When a provider is not configured, its button renders disabled with an honest note ("activates at launch, email works today") instead of failing after the click.

## The game engine

- **Leagues are created FOR a named competition.** Step 1 of creation is the competition picker, served by `/api/leagues/meta`, which lists every competition with a computed state (live, upcoming, complete) so nobody has to guess what is on. Advance setup for the next event is allowed. Settings (scoring overrides, roster shape, pick clock, regular weeks, playoff size) snapshot onto the league at creation.
- **Invites** are 10-character codes (link or code entry), generated per league, revocable by row.
- **Draft** (`lib/draft.js`): snake order drawn at random, one round per roster spot plus a final Squad round (draft one pro org). The pick clock is enforced lazily: any draft read or pick first advances expired picks with an auto-pick of the best available by consensus rank. That keeps a serverless deployment correct with no background timer.
- **Lineups** (`api/leagues/lineup.js`): five starters (Vanguard, Duelist, Strategist, two Flex) plus up to three bench. A week locks at the first pro match of that week in the league's competition. Lineups carry forward until changed.
- **Scoring** (`lib/scoring.js`, `lib/league.js`): player points are computed per series and summed, because the win and carry bonuses are per-series facts. The win bonus compares the player's pro team to the series score; the carry bonus fires at 25 or more eliminations in a series. The Squad slot scores its org's map wins, series wins and clean sweeps. Scoring a week is idempotent: it replaces that week's rows and recomputes the table from scratch.
- **Schedule and playoffs:** round-robin by the circle method, repeated if the configured weeks exceed one cycle. After the final regular week, the commissioner seeds the top four (1v4, 2v3); when the semifinals are scored, the winners are advanced into a final automatically; scoring the final completes the league and logs the champion to the activity feed.
- **Activity feed:** league events (creation, joins, draft picks, scores, playoffs, champion) are rows in `events` and render in the league room. This is the cheap, honest version of a league chat for wave 1.

## Stats ingestion (honesty rules)

`api/admin/import-results.js` is the only way results enter. Rules, enforced in code:

1. Every payload must name a `source` (and may add `sourceUrl`). Unattributed stats are rejected.
2. Authorized by a site admin session or the `ADMIN_IMPORT_KEY` header.
3. Team and player references resolve by short code, name or IGN inside the competition's game. Anything unresolved is reported in the response. It is never dropped silently and never guessed.
4. Imports upsert by (season, week, teams) and (match, player), so a corrected box score can be re-imported safely.

The refresh lane this implies: a dated dataset refresh updates `db/seed-data` and rebuilds `data/v1` (rosters, calendar), while results flow through the import API. Both paths carry their sources.

## Design identity

Named: **the stat sheet, broadcast desk.** Paper surfaces and ink text for the public layer, a dark ink band for the hero and draft board, tabular mono for every number, hairline rules instead of boxes-on-boxes, one accent (signal teal) plus small role tints (Vanguard green, Duelist red, Strategist blue). Type voice is a grotesk for words and mono for data; the rhythm is ruled tables and calendar strips, like a broadcast desk's stat pack. It shares the fleet's discipline (clear hierarchy, professional finish) and no other site's look.

Copy rule, enforced at wave 1 and checked before every wave report: no em dashes or en dashes anywhere in the tree (grep-verified), no filler phrasing, no machine tells. Numbers in copy are the real counts from the dataset.

## Parked deploy-time steps (need the user's hand, never block the build)

1. **OAuth app registration.** Create the Google Cloud OAuth client and the X developer app, then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET` and `OAUTH_REDIRECT_BASE` in the deployment env. The flows are already wired; they switch on when the credentials exist.
2. **Neon database.** Create the free-tier project and set `DATABASE_URL`.
3. **Deployment itself.** No Vercel project, no live repo, no deployment exists for this site. Creating one needs an explicit push order from the user (two-track rule, below).

## Two-track rule

`astercast/fantasy-rivals` is a working repo: build only, never deployed. There is no `fantasy-rivals-live` repo and no Vercel project, and there will not be until the user gives an explicit push order. The game repo (The Drowning Ones) is a separate track and unrelated.
