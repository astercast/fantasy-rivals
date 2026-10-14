import { handler, json, methodNotAllowed } from "../../lib/http.js";
import { all } from "../../lib/db.js";
import { DEFAULT_SCORING, SQUAD_SCORING, DEFAULT_ROSTER } from "../../lib/scoring.js";

// GET /api/leagues/meta - the competition picker data for league creation:
// every game, its competitions, and each competition's live state. This is
// the season-clarity surface in API form: status is computed from dates +
// the stored status so the UI can say LIVE NOW / NEXT UP / COMPLETE plainly.
export default handler(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const games = await all("SELECT * FROM games ORDER BY slug ASC");
  const seasons = await all("SELECT * FROM seasons ORDER BY starts_on ASC");
  const today = new Date().toISOString().slice(0, 10);
  const competitions = seasons.map((s) => {
    // Same calendar derivation as scripts/build-site.mjs, so the picker and
    // the public season hub can never disagree: a dated competition is
    // upcoming before its window, live inside it, complete after it ends.
    // The stored status is only a fallback for undated records.
    let state;
    if (s.starts_on && s.ends_on) {
      state = today < s.starts_on ? "upcoming" : today > s.ends_on ? "complete" : "live";
    } else {
      state = s.status === "current" ? "live" : s.status;
    }
    return {
      id: s.id,
      gameId: s.game_id,
      name: s.name,
      stage: s.stage,
      startsOn: s.starts_on,
      endsOn: s.ends_on,
      state, // live | upcoming | complete
      sourceNote: s.source_note,
      leagueCreationOpen: state === "live" || state === "upcoming",
    };
  });
  const stateRank = { live: 0, upcoming: 1, complete: 2 };
  competitions.sort((a, b) =>
    (stateRank[a.state] ?? 3) - (stateRank[b.state] ?? 3) ||
    // The game's headline circuit (Ignite for Marvel Rivals) leads within a
    // state group; a second-tier event never outranks it in the picker.
    (b.name.includes("Ignite") ? 1 : 0) - (a.name.includes("Ignite") ? 1 : 0) ||
    (a.startsOn || "").localeCompare(b.startsOn || "")
  );
  json(res, 200, {
    ok: true,
    games: games.map((g) => ({ id: g.id, slug: g.slug, name: g.name, status: g.status })),
    competitions,
    defaults: { scoring: DEFAULT_SCORING, squadScoring: SQUAD_SCORING, roster: DEFAULT_ROSTER },
  });
});
