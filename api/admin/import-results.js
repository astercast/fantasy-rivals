import { handler, json, fail, readBody, methodNotAllowed } from "../../lib/http.js";
import { currentUser } from "../../lib/session.js";
import { newId, q, one, all } from "../../lib/db.js";

// POST /api/admin/import-results - the results/stats ingestion path.
// Auth: a signed-in site admin, OR the ADMIN_IMPORT_KEY header (pipeline).
// Every payload must name its source; imported rows carry it forever.
// Body: {
//   seasonId, source, sourceUrl,
//   matches: [{ week, roundLabel, teamA, teamB, startsAt, scoreA, scoreB,
//               status, stats: [{ playerIgn, mapLabel, eliminations, deaths,
//               assists, finalHits, damageDealt, damageBlocked, healing,
//               heroes }] }]
// A stat line is one player's line on one map: the game produces its
// lines per map, so mapLabel names the map the line came from (the map
// name, or "Map 1" and so on). Lines without a mapLabel are series
// aggregates and share the empty label. Scoring aggregates a player's
// map lines into one series line before applying the scoring table.
// }
// Team/player references resolve by short code, team name, or player IGN
// within the competition's game. Anything unresolved is reported back in
// `unresolved` - never silently dropped, never guessed.
export default handler(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const keyOk =
    process.env.ADMIN_IMPORT_KEY &&
    req.headers["x-import-key"] === process.env.ADMIN_IMPORT_KEY;
  const user = await currentUser(req);
  if (!keyOk && !(user && user.isAdmin)) {
    return fail(res, 403, "forbidden", "Import requires a site admin or the import key.");
  }
  const body = await readBody(req);
  const { seasonId, source, sourceUrl } = body;
  if (!seasonId || !source) {
    return fail(res, 400, "bad_import", "seasonId and a named source are required - stats never arrive unattributed.");
  }
  const season = await one("SELECT * FROM seasons WHERE id = ?", [seasonId]);
  if (!season) return fail(res, 404, "no_season", "Competition not found.");
  const gameId = season.game_id;
  const teams = await all("SELECT * FROM pro_teams WHERE game_id = ?", [gameId]);
  const players = await all("SELECT * FROM players WHERE game_id = ?", [gameId]);
  const teamByRef = new Map();
  for (const t of teams) {
    teamByRef.set(t.short.toLowerCase(), t);
    teamByRef.set(t.name.toLowerCase(), t);
  }
  const playerByIgn = new Map(players.map((p) => [p.ign.toLowerCase(), p]));

  const report = { matchesUpserted: 0, statLines: 0, unresolved: [] };
  for (const m of body.matches || []) {
    const teamA = teamByRef.get(String(m.teamA || "").toLowerCase());
    const teamB = teamByRef.get(String(m.teamB || "").toLowerCase());
    if (!teamA || !teamB) {
      report.unresolved.push({ match: m, reason: "team not found" });
      continue;
    }
    let match = await one(
      "SELECT * FROM matches WHERE season_id = ? AND week = ? AND team_a_id = ? AND team_b_id = ?",
      [seasonId, m.week || 1, teamA.id, teamB.id]
    );
    if (!match) {
      const id = newId();
      await q(
        `INSERT INTO matches (id, season_id, week, round_label, team_a_id, team_b_id, starts_at, status, score_a, score_b, source, source_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, seasonId, m.week || 1, m.roundLabel || "", teamA.id, teamB.id,
         m.startsAt || "", m.status || "scheduled",
         m.scoreA ?? null, m.scoreB ?? null, source, sourceUrl || ""]
      );
      match = { id };
    } else {
      await q(
        "UPDATE matches SET round_label = ?, starts_at = ?, status = ?, score_a = ?, score_b = ?, source = ?, source_url = ? WHERE id = ?",
        [m.roundLabel || "", m.startsAt || "", m.status || "scheduled",
         m.scoreA ?? null, m.scoreB ?? null, source, sourceUrl || "", match.id]
      );
    }
    report.matchesUpserted++;
    for (const s of m.stats || []) {
      const player = playerByIgn.get(String(s.playerIgn || "").toLowerCase());
      if (!player) {
        report.unresolved.push({ stat: s, reason: "player not found" });
        continue;
      }
      await q(
        `INSERT INTO player_match_stats (id, match_id, player_id, map_label, heroes, eliminations, deaths, assists, final_hits, damage_dealt, damage_blocked, healing, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(match_id, player_id, map_label) DO UPDATE SET
           heroes = excluded.heroes, eliminations = excluded.eliminations,
           deaths = excluded.deaths, assists = excluded.assists,
           final_hits = excluded.final_hits, damage_dealt = excluded.damage_dealt,
           damage_blocked = excluded.damage_blocked, healing = excluded.healing,
           source = excluded.source`,
        [newId(), match.id, player.id, String(s.mapLabel || ""), JSON.stringify(s.heroes || []),
         s.eliminations || 0, s.deaths || 0, s.assists || 0, s.finalHits || 0,
         s.damageDealt || 0, s.damageBlocked || 0, s.healing || 0, source]
      );
      report.statLines++;
    }
  }
  json(res, 200, { ok: true, ...report });
});
