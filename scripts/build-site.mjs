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
    let state = s.status === "current" ? "live" : s.status;
    if (state === "live" && s.endsOn && s.endsOn < today) state = "complete";
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

writeFileSync(
  join(OUT, "scoring.json"),
  JSON.stringify({ generatedAt, scoring: DEFAULT_SCORING, squadScoring: SQUAD_SCORING, roster: DEFAULT_ROSTER }, null, 2)
);
writeFileSync(
  join(OUT, "games.json"),
  JSON.stringify({ generatedAt, games: datasets.map((d) => d.game) }, null, 2)
);
console.log("build complete");
