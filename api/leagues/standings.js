import { handler, json, fail, query, methodNotAllowed, requireUser } from "../../lib/http.js";
import { currentUser } from "../../lib/session.js";
import { all } from "../../lib/db.js";
import { getLeague, getMember } from "../../lib/league.js";

// GET /api/leagues/standings?leagueId=&week= - standings table, all
// matchups, and (for the requested week) per-player score detail.
export default handler(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const user = await currentUser(req);
  if (!requireUser(req, res, user)) return;
  const { leagueId, week } = query(req);
  const league = leagueId ? await getLeague(leagueId) : null;
  if (!league) return fail(res, 404, "no_league", "League not found.");
  if (!(await getMember(league.id, user.id))) {
    return fail(res, 403, "not_member", "You're not in this league.");
  }
  const standings = await all(
    `SELECT s.*, m.team_name FROM standings s JOIN league_members m ON m.id = s.member_id
      WHERE s.league_id = ? ORDER BY s.wins DESC, s.points_for DESC`,
    [league.id]
  );
  const matchups = await all(
    `SELECT mu.*, ma.team_name AS team_a, mb.team_name AS team_b
       FROM weekly_matchups mu
       JOIN league_members ma ON ma.id = mu.member_a
       LEFT JOIN league_members mb ON mb.id = mu.member_b
      WHERE mu.league_id = ? ORDER BY mu.week ASC`,
    [league.id]
  );
  const w = Number(week) || 1;
  const playerScores = await all(
    `SELECT wps.*, p.ign, p.role, m.team_name
       FROM weekly_player_scores wps
       JOIN players p ON p.id = wps.player_id
       JOIN league_members m ON m.id = wps.member_id
      WHERE wps.league_id = ? AND wps.week = ? ORDER BY wps.points DESC`,
    [league.id, w]
  );
  const squadScores = await all(
    `SELECT wss.*, t.name AS squad_name, m.team_name
       FROM weekly_squad_scores wss
       JOIN pro_teams t ON t.id = wss.pro_team_id
       JOIN league_members m ON m.id = wss.member_id
      WHERE wss.league_id = ? AND wss.week = ?`,
    [league.id, w]
  );
  json(res, 200, {
    ok: true,
    standings,
    matchups,
    week: w,
    playerScores: playerScores.map((s) => ({ ...s, breakdown: JSON.parse(s.breakdown || "{}") })),
    squadScores: squadScores.map((s) => ({ ...s, breakdown: JSON.parse(s.breakdown || "{}") })),
  });
});
