import { handler, json, fail, readBody, methodNotAllowed, requireUser } from "../../lib/http.js";
import { currentUser } from "../../lib/session.js";
import { getLeague, getMember, scoreWeek, generatePlayoffs, leagueSettings } from "../../lib/league.js";

// POST /api/leagues/score-week { leagueId, week, generatePlayoffs?: bool }
// Commissioner-only. Scores a week from the imported real results, then
// (on request, after the final regular week) seeds the playoff bracket.
export default handler(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const user = await currentUser(req);
  if (!requireUser(req, res, user)) return;
  const body = await readBody(req);
  const league = body.leagueId ? await getLeague(body.leagueId) : null;
  if (!league) return fail(res, 404, "no_league", "League not found.");
  if (league.commissioner_id !== user.id && !user.isAdmin) {
    return fail(res, 403, "not_commissioner", "Only the commissioner can score a week.");
  }
  const week = Number(body.week);
  if (!week || week < 1) return fail(res, 400, "bad_week", "Give a week number.");
  const result = await scoreWeek(league, week);
  let playoffs = null;
  const settings = leagueSettings(league);
  if (body.generatePlayoffs && week === settings.regularWeeks && league.status === "active") {
    playoffs = await generatePlayoffs(league);
  }
  if (week > settings.regularWeeks && league.status === "playoffs") {
    // A scored final week closes the league.
    const finalWeek = settings.regularWeeks + 2;
    if (week >= finalWeek) {
      const { q } = await import("../../lib/db.js");
      await q("UPDATE leagues SET status = 'complete' WHERE id = ?", [league.id]);
    }
  }
  json(res, 200, { ok: true, ...result, playoffs });
});
