import { handler, json, fail, readBody, methodNotAllowed, requireUser } from "../../lib/http.js";
import { currentUser } from "../../lib/session.js";
import { newId, q, all } from "../../lib/db.js";
import { leagueForInvite, getMember, listMembers, logEvent, now } from "../../lib/league.js";

// POST /api/leagues/join { code, teamName } - join via invite code/link.
export default handler(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const user = await currentUser(req);
  if (!requireUser(req, res, user)) return;
  const { code, teamName } = await readBody(req);
  if (!code) return fail(res, 400, "bad_code", "Enter the invite code.");
  if (!teamName || String(teamName).trim().length < 2) {
    return fail(res, 400, "bad_team_name", "Name your team (2+ characters).");
  }
  const league = await leagueForInvite(code);
  if (!league) return fail(res, 404, "bad_invite", "That invite code doesn't match a league.");
  if (await getMember(league.id, user.id)) {
    return fail(res, 409, "already_member", "You're already in this league.");
  }
  if (league.status !== "forming") {
    return fail(res, 409, "league_started", "This league has already started its draft.");
  }
  const members = await listMembers(league.id);
  if (members.length >= league.size) {
    return fail(res, 409, "league_full", "This league is full.");
  }
  const memberId = newId();
  await q(
    "INSERT INTO league_members (id, league_id, user_id, team_name, joined_at) VALUES (?, ?, ?, ?, ?)",
    [memberId, league.id, user.id, String(teamName).trim(), now()]
  );
  await logEvent(league.id, "member_joined", { teamName, user: user.displayName });
  json(res, 200, { ok: true, league, memberId, members: await listMembers(league.id) });
});
