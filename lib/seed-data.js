// seed-data.js - loads the curated, source-noted dataset (db/seed-data/*.json)
// into the DB. Upserts by natural keys so refreshes are idempotent:
// games by slug, seasons by (game, name), teams by (game, short),
// players by (game, ign). The dataset itself is the curated record of the
// research in RESEARCH.md - every row traces to a named source there.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { newId, q, one } from "./db.js";

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "seed-data");

export function loadSeedFiles() {
  return readdirSync(SEED_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(SEED_DIR, f), "utf8")));
}

export async function seedGameData() {
  const files = loadSeedFiles();
  const summary = { games: 0, seasons: 0, teams: 0, players: 0 };
  for (const data of files) {
    const g = data.game;
    let game = await one("SELECT * FROM games WHERE slug = ?", [g.slug]);
    if (!game) {
      game = { id: newId() };
      await q("INSERT INTO games (id, slug, name, status) VALUES (?, ?, ?, ?)",
        [game.id, g.slug, g.name, g.status || "active"]);
    }
    summary.games++;
    const seasonIds = {};
    for (const s of data.seasons || []) {
      let row = await one("SELECT * FROM seasons WHERE game_id = ? AND name = ?", [game.id, s.name]);
      if (!row) {
        row = { id: newId() };
        await q(
          `INSERT INTO seasons (id, game_id, name, stage, starts_on, ends_on, status, source_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.id, game.id, s.name, s.stage || "", s.startsOn || "", s.endsOn || "",
           s.status || "current", s.sourceNote || ""]
        );
      } else {
        await q(
          "UPDATE seasons SET stage = ?, starts_on = ?, ends_on = ?, status = ?, source_note = ? WHERE id = ?",
          [s.stage || "", s.startsOn || "", s.endsOn || "", s.status || "current", s.sourceNote || "", row.id]
        );
      }
      seasonIds[s.name] = row.id;
      summary.seasons++;
    }
    const teamIds = {};
    for (const t of data.teams || []) {
      let row = await one("SELECT * FROM pro_teams WHERE game_id = ? AND short = ?", [game.id, t.short]);
      if (!row) {
        row = { id: newId() };
        await q("INSERT INTO pro_teams (id, game_id, name, short, region) VALUES (?, ?, ?, ?, ?)",
          [row.id, game.id, t.name, t.short, t.region || ""]);
      }
      teamIds[t.short] = row.id;
      summary.teams++;
    }
    for (const p of data.players || []) {
      const teamId = p.team ? teamIds[p.team] : null;
      let row = await one("SELECT * FROM players WHERE game_id = ? AND ign = ?", [game.id, p.ign]);
      if (!row) {
        row = { id: newId() };
        await q(
          `INSERT INTO players (id, game_id, pro_team_id, ign, real_name, role, heroes, draft_rank, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [row.id, game.id, teamId, p.ign, p.realName || "", p.role || "",
           JSON.stringify(p.heroes || []), p.draftRank ?? 999]
        );
      } else {
        await q(
          "UPDATE players SET pro_team_id = ?, real_name = ?, role = ?, heroes = ?, draft_rank = ? WHERE id = ?",
          [teamId, p.realName || "", p.role || "", JSON.stringify(p.heroes || []), p.draftRank ?? 999, row.id]
        );
      }
      summary.players++;
    }
  }
  return summary;
}
