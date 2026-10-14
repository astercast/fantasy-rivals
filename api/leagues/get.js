import { handler, json, fail, query, methodNotAllowed, requireUser } from "../../lib/http.js";
import { currentUser } from "../../lib/session.js";
import { all } from "../../lib/db.js";
import { getLeague, getMember, listMembers } from "../../lib/league.js";

// GET /api/leagues/get?id= - league overview: members, your roster, the
// activity feed, and this week's matchup state.
export default handler(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const user = await currentUser(req);
  if (!requireUser(req, res, user)) return;
  const { id } = query(req);
  const league = id ? await getLeague(id) : null;
  if (!league) return fail(res, 404, "no_league", "League not found.");
  const me = await getMember(league.id, user.id);
  if (!me) return fail(res, 403, "not_member", "You're not in this league.");
  const members = await listMembers(league.id);
  const roster = await all(
    `SELECT re.*, p.ign, p.role, p.draft_rank, t.name AS pro_team_name, st.name AS squad_name
       FROM roster_entries re
       LEFT JOIN players p ON p.id = re.player_id
       LEFT JOIN pro_teams t ON t.id = p.pro_team_id
       LEFT JOIN pro_teams st ON st.id = re.pro_team_id
      WHERE re.league_id = ? AND re.member_id = ?`,
    [league.id, me.id]
  );
  const season = league.season_id
    ? (await all("SELECT * FROM seasons WHERE id = ?", [league.season_id]))[0]
    : null;
  const events = await all(
    "SELECT * FROM events WHERE league_id = ? ORDER BY created_at DESC LIMIT 30",
    [league.id]
  );
  json(res, 200, {
    ok: true,
    league: { ...league, settings: JSON.parse(league.settings || "{}") },
    season,
    me,
    members,
    myRoster: roster,
    events: events.map((e) => ({ ...e, payload: JSON.parse(e.payload || "{}") })),
    isCommissioner: league.commissioner_id === user.id,
  });
});
