import { handler, json, fail, readBody, methodNotAllowed, requireUser } from "../../lib/http.js";
import { currentUser } from "../../lib/session.js";
import { getLeague, getMember, createInvite } from "../../lib/league.js";

// POST /api/leagues/invite { leagueId } - mint a fresh invite code
// (any member can invite; the link is /join.html?code=XXXX).
export default handler(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const user = await currentUser(req);
  if (!requireUser(req, res, user)) return;
  const { leagueId } = await readBody(req);
  const league = leagueId ? await getLeague(leagueId) : null;
  if (!league) return fail(res, 404, "no_league", "League not found.");
  if (!(await getMember(league.id, user.id))) {
    return fail(res, 403, "not_member", "Only league members can invite.");
  }
  const code = await createInvite(league.id, user.id);
  json(res, 200, { ok: true, code, path: `/join.html?code=${code}` });
});
