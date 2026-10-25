// build-site.mjs - compiles the public layer into data/v1/*.json from the
// curated seed dataset (db/seed-data). Static-first: the season hub, teams,
// players and schedule pages render from these files with zero DB reads.
// The competition state (LIVE NOW / NEXT UP / COMPLETE) is computed here
// from dated, sourced season records - and the build stamps `generatedAt`
// so staleness is always visible on the surface.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SCORING, SQUAD_SCORING, DEFAULT_ROSTER } from "../lib/scoring.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_DIR = join(ROOT, "db", "seed-data");
const OUT = join(ROOT, "data", "v1");
mkdirSync(OUT, { recursive: true });

const datasets = readdirSync(SEED_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(SEED_DIR, f), "utf8")));

const today = new Date().toISOString().slice(0, 10);
const generatedAt = new Date().toISOString();

for (const data of datasets) {
  const slug = data.game.slug;
  const seasons = (data.seasons || []).map((s) => {
    // State is derived from the calendar, never hand-set: a dated
    // competition is upcoming before its window, live inside it, and
    // complete after it ends. The stored status is only a fallback for
    // undated records. Rebuilding after a window closes rolls the public
    // surface forward on its own (Stage 2 completes on Oct 19, the Grand
    // Finals go live on Nov 23) with no copy edit required.
    let state;
    if (s.startsOn && s.endsOn) {
      state = today < s.startsOn ? "upcoming" : today > s.endsOn ? "complete" : "live";
    } else {
      state = s.status === "current" ? "live" : s.status || "upcoming";
    }
    return { ...s, state };
  });
  const live = seasons.filter((s) => s.state === "live");
  const upcoming = seasons
    .filter((s) => s.state === "upcoming")
    .sort((a, b) => (a.startsOn || "").localeCompare(b.startsOn || ""));
  const seasonStatus = {
    game: data.game,
    generatedAt,
    asOf: today,
    liveNow: live,
    nextUp: upcoming[0] || null,
    headline: live.length
      ? `${live[0].name} is live now - league creation is open.`
      : upcoming[0]
        ? `Next up: ${upcoming[0].name} starts ${upcoming[0].startsOn}. League creation is open for it now.`
        : "No competition is scheduled right now - check back for the next announcement.",
    seasons,
  };
  writeFileSync(join(OUT, `${slug}-season.json`), JSON.stringify(seasonStatus, null, 2));
  writeFileSync(
    join(OUT, `${slug}-teams.json`),
    JSON.stringify({ generatedAt, game: data.game, teams: data.teams || [], players: data.players || [] }, null, 2)
  );
  writeFileSync(
    join(OUT, `${slug}-schedule.json`),
    JSON.stringify({ generatedAt, game: data.game, matches: data.matches || [] }, null, 2)
  );
  console.log(`built data/v1 for ${slug}: ${seasons.length} competitions, ${(data.teams || []).length} teams, ${(data.players || []).length} players`);
}

/* Season Status Plate fallback + pulse seed + <meta name="built">
   (2026-10-24, fr-live): season-live.json is the no-JS fallback the
   heartbeat watcher also rolls; pulse.json is seeded here only when
   missing so /api/health can always read it (the watcher owns it
   afterwards); every page's <meta name="built"> is stamped with this
   build's generatedAt, which pulse.js compares against pulse.json. */
const mr = datasets.find((d) => d.game.slug === "marvel-rivals");
if (mr) {
  const st = (mr.seasons || []).map((s) => ({
    name: s.name,
    state: s.startsOn && s.endsOn
      ? (today < s.startsOn ? "upcoming" : today > s.endsOn ? "complete" : "live")
      : (s.status === "current" ? "live" : s.status || "upcoming"),
  }));
  writeFileSync(join(OUT, "season-live.json"),
    JSON.stringify({ format: "season-live/1", asOf: today, generated_at: generatedAt, seasons: st }, null, 2));
}
try {
  readFileSync(join(OUT, "pulse.json"), "utf8");
} catch {
  writeFileSync(join(OUT, "pulse.json"), JSON.stringify({
    format: "pulse/1", generated_at: generatedAt, healthy: true,
    sources_ok: 0, sources_total: 0, sources: [], changes: [],
  }, null, 2));
}
for (const f of readdirSync(ROOT).filter((f) => f.endsWith(".html"))) {
  const path = join(ROOT, f);
  const html = readFileSync(path, "utf8");
  const stamped = html.includes('<meta name="built"')
    ? html.replace(/<meta name="built" content="[^"]*">/, `<meta name="built" content="${generatedAt}">`)
    : html.replace(/<meta charset="[^"]*">/, (m) => `${m}\n<meta name="built" content="${generatedAt}">`);
  if (stamped !== html) writeFileSync(path, stamped);
}

writeFileSync(
  join(OUT, "scoring.json"),
  JSON.stringify({ generatedAt, scoring: DEFAULT_SCORING, squadScoring: SQUAD_SCORING, roster: DEFAULT_ROSTER }, null, 2)
);
writeFileSync(
  join(OUT, "games.json"),
  JSON.stringify({ generatedAt, games: datasets.map((d) => d.game) }, null, 2)
);
console.log("build complete");
