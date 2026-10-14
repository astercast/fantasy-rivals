import { handler, json, fail, readBody, query, methodNotAllowed, requireUser } from "../../lib/http.js";
import { currentUser } from "../../lib/session.js";
import { all } from "../../lib/db.js";
import { getLeague, getMember } from "../../lib/league.js";
import { getDraft, startDraft, makePick, draftState } from "../../lib/draft.js";

// GET  /api/leagues/draft?leagueId= - draft state + the available pool.
// POST /api/leagues/draft { leagueId, action: "start" } - commissioner.
// POST /api/leagues/draft { leagueId, action: "pick", playerId|proTeamId }
export default handler(async (req, res) => {
  const user = await currentUser(req);
  if (!requireUser(req, res, user)) return;

  if (req.method === "GET") {
    const { leagueId } = query(req);
    const league = leagueId ? await getLeague(leagueId) : null;
    if (!league) return fail(res, 404, "no_league", "League not found.");
    const me = await getMember(league.id, user.id);
    if (!me) return fail(res, 403, "not_member", "You're not in this league.");
    const state = await draftState(league);
    const draftedPlayers = new Set(state.picks.map((p) => p.player_id).filter(Boolean));
    const draftedSquads = new Set(state.picks.map((p) => p.pro_team_id).filter(Boolean));
    const pool = await all(
      `SELECT p.id, p.ign, p.role, p.draft_rank, p.heroes, t.name AS pro_team_name, t.short AS pro_team_short
         FROM players p LEFT JOIN pro_teams t ON t.id = p.pro_team_id
        WHERE p.game_id = ? AND p.active = 1 ORDER BY p.draft_rank ASC`,
      [league.game_id]
    );
    const squads = await all(
      "SELECT id, name, short, region FROM pro_teams WHERE game_id = ? ORDER BY name ASC",
      [league.game_id]
    );
    return json(res, 200, {
      ok: true,
      ...state,
      myMemberId: me.id,
      pool: pool
        .filter((p) => !draftedPlayers.has(p.id))
        .map((p) => ({ ...p, heroes: JSON.parse(p.heroes || "[]") })),
      squads: squads.filter((s) => !draftedSquads.has(s.id)),
    });
  }

  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  const body = await readBody(req);
  const league = body.leagueId ? await getLeague(body.leagueId) : null;
  if (!league) return fail(res, 404, "no_league", "League not found.");
  const me = await getMember(league.id, user.id);
  if (!me) return fail(res, 403, "not_member", "You're not in this league.");

  if (body.action === "start") {
    if (league.commissioner_id !== user.id) {
      return fail(res, 403, "not_commissioner", "Only the commissioner can start the draft.");
    }
    if (!["forming", "drafting"].includes(league.status)) {
      return fail(res, 409, "bad_state", "This league's draft can't be started now.");
    }
    await startDraft(league);
    return json(res, 200, { ok: true, ...(await draftState(league)) });
  }
  if (body.action === "pick") {
    const draft = await getDraft(league.id);
    if (!draft) return fail(res, 409, "no_draft", "No draft exists for this league yet.");
    await makePick(league, draft, me.id, {
      playerId: body.playerId || null,
      proTeamId: body.proTeamId || null,
    });
    return json(res, 200, { ok: true, ...(await draftState(league)) });
  }
  return fail(res, 400, "bad_action", "Unknown draft action.");
});
