import { handler, json, fail, readBody, query, methodNotAllowed, requireUser, httpError } from "../../lib/http.js";
import { currentUser } from "../../lib/session.js";
import { newId, q, all, one } from "../../lib/db.js";
import { getLeague, getMember, leagueSettings } from "../../lib/league.js";
import { validateLineup } from "../../lib/scoring.js";

// GET  /api/leagues/lineup?leagueId=&week= - your roster + saved lineup.
// POST /api/leagues/lineup { leagueId, week, assignments: [{playerId, slot}] }
// Locks: a week locks at the first pro match of that week in the league's
// competition (matches.starts_at). Locked weeks reject changes.
export default handler(async (req, res) => {
  const user = await currentUser(req);
  if (!requireUser(req, res, user)) return;

  if (req.method === "GET") {
    const { leagueId, week } = query(req);
    const league = leagueId ? await getLeague(leagueId) : null;
    if (!league) return fail(res, 404, "no_league", "League not found.");
    const me = await getMember(league.id, user.id);
    if (!me) return fail(res, 403, "not_member", "You're not in this league.");
    const w = Number(week) || 1;
    const roster = await all(
      `SELECT re.player_id, re.pro_team_id, p.ign, p.role, t.name AS pro_team_name, st.name AS squad_name
         FROM roster_entries re
         LEFT JOIN players p ON p.id = re.player_id
         LEFT JOIN pro_teams t ON t.id = p.pro_team_id
         LEFT JOIN pro_teams st ON st.id = re.pro_team_id
        WHERE re.league_id = ? AND re.member_id = ?`,
      [league.id, me.id]
    );
    const lineup = await all(
      "SELECT * FROM lineups WHERE league_id = ? AND member_id = ? AND week = ?",
      [league.id, me.id, w]
    );
    const lock = await weekLock(league, w);
    return json(res, 200, {
      ok: true, week: w, roster, lineup,
      locked: lock.locked, locksAt: lock.at,
      rosterConfig: leagueSettings(league).roster,
    });
  }

  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  const body = await readBody(req);
  const league = body.leagueId ? await getLeague(body.leagueId) : null;
  if (!league) return fail(res, 404, "no_league", "League not found.");
  const me = await getMember(league.id, user.id);
  if (!me) return fail(res, 403, "not_member", "You're not in this league.");
  const week = Number(body.week) || 1;
  const lock = await weekLock(league, week);
  if (lock.locked) {
    return fail(res, 409, "week_locked", `Week ${week} locked at the first match (${lock.at}).`);
  }
  const assignments = Array.isArray(body.assignments) ? body.assignments : [];
  const rosterRows = await all(
    "SELECT * FROM roster_entries WHERE league_id = ? AND member_id = ? AND player_id IS NOT NULL",
    [league.id, me.id]
  );
  const rosterIds = new Set(rosterRows.map((r) => r.player_id));
  for (const a of assignments) {
    if (!rosterIds.has(a.playerId)) {
      return fail(res, 400, "not_rostered", "Every starter must be on your roster.");
    }
  }
  const players = await all(
    `SELECT * FROM players WHERE id IN (${[...rosterIds].map(() => "?").join(",") || "NULL"})`,
    [...rosterIds]
  );
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]));
  const normalized = assignments.map((a) => ({ player_id: a.playerId, slot: a.slot }));
  const errors = validateLineup(leagueSettings(league).roster, normalized, playersById);
  if (errors.length) return fail(res, 400, "bad_lineup", errors.join(" "));
  await q("DELETE FROM lineups WHERE league_id = ? AND member_id = ? AND week = ?", [league.id, me.id, week]);
  for (const a of normalized) {
    await q(
      "INSERT INTO lineups (id, league_id, member_id, week, player_id, slot) VALUES (?, ?, ?, ?, ?, ?)",
      [newId(), league.id, me.id, week, a.player_id, a.slot]
    );
  }
  json(res, 200, { ok: true, week, saved: normalized.length });
});

async function weekLock(league, week) {
  if (!league.season_id) return { locked: false, at: null };
  const first = await one(
    "SELECT MIN(starts_at) AS at FROM matches WHERE season_id = ? AND week = ? AND starts_at != ''",
    [league.season_id, week]
  );
  if (!first || !first.at) return { locked: false, at: null };
  return { locked: Date.parse(first.at) <= Date.now(), at: first.at };
}
