import { handler, json, fail, readBody, methodNotAllowed, requireUser, httpError } from "../../lib/http.js";
import { currentUser } from "../../lib/session.js";
import { newId, q, one, all } from "../../lib/db.js";
import { createInvite, listMembers, logEvent, now } from "../../lib/league.js";
import { DEFAULT_SCORING, SQUAD_SCORING, DEFAULT_ROSTER } from "../../lib/scoring.js";

// GET  /api/leagues - leagues the signed-in user belongs to.
// POST /api/leagues - create a league FOR a named competition (the picker
// is step one: seasonId is required and must be a real competition).
export default handler(async (req, res) => {
  const user = await currentUser(req);
  if (!requireUser(req, res, user)) return;

  if (req.method === "GET") {
    const rows = await all(
      `SELECT l.*, m.team_name, m.id AS member_id,
              (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS member_count
         FROM leagues l JOIN league_members m ON m.league_id = l.id
        WHERE m.user_id = ? ORDER BY l.created_at DESC`,
      [user.id]
    );
    return json(res, 200, { ok: true, leagues: rows });
  }
  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);

  const body = await readBody(req);
  const { name, seasonId, teamName, size, settings } = body;
  if (!name || String(name).trim().length < 3) {
    return fail(res, 400, "bad_name", "League name needs at least 3 characters.");
  }
  if (!teamName || String(teamName).trim().length < 2) {
    return fail(res, 400, "bad_team_name", "Name your team (2+ characters).");
  }
  const season = seasonId ? await one("SELECT * FROM seasons WHERE id = ?", [seasonId]) : null;
  if (!season) {
    return fail(res, 400, "bad_competition", "Pick the competition this league is for.");
  }
  const leagueSize = Math.min(12, Math.max(2, Number(size) || 6));
  const mergedSettings = {
    scoring: { ...DEFAULT_SCORING, ...(settings?.scoring || {}) },
    squadScoring: { ...SQUAD_SCORING, ...(settings?.squadScoring || {}) },
    roster: settings?.roster || DEFAULT_ROSTER,
    pickClockSeconds: settings?.pickClockSeconds ?? 60,
    regularWeeks: settings?.regularWeeks ?? 5,
    playoffTeams: settings?.playoffTeams ?? 4,
  };
  const id = newId();
  await q(
    `INSERT INTO leagues (id, game_id, season_id, name, commissioner_id, size, status, settings, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'forming', ?, ?)`,
    [id, season.game_id, season.id, String(name).trim(), user.id, leagueSize, JSON.stringify(mergedSettings), now()]
  );
  const memberId = newId();
  await q(
    "INSERT INTO league_members (id, league_id, user_id, team_name, joined_at) VALUES (?, ?, ?, ?, ?)",
    [memberId, id, user.id, String(teamName).trim(), now()]
  );
  const inviteCode = await createInvite(id, user.id);
  await logEvent(id, "league_created", { name, competition: season.name });
  const league = await one("SELECT * FROM leagues WHERE id = ?", [id]);
  json(res, 201, { ok: true, league, memberId, inviteCode, members: await listMembers(id) });
});
