// league.js - league lifecycle: members, invites, schedule, scoring, standings.

import { randomBytes } from "node:crypto";
import { newId, q, one, all } from "./db.js";
import { mergeScoring, scoreStatLine, scoreSquadWeek, SQUAD_SCORING, DEFAULT_ROSTER } from "./scoring.js";

export const now = () => new Date().toISOString();

export async function logEvent(leagueId, type, payload = {}) {
  await q(
    "INSERT INTO events (id, league_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
    [newId(), leagueId, type, JSON.stringify(payload), now()]
  );
}

export function leagueSettings(league) {
  let s = {};
  try { s = JSON.parse(league.settings || "{}"); } catch { s = {}; }
  return {
    scoring: mergeScoring(s.scoring || {}),
    roster: s.roster || DEFAULT_ROSTER,
    pickClockSeconds: s.pickClockSeconds ?? 60,
    regularWeeks: s.regularWeeks ?? 5,
    playoffTeams: s.playoffTeams ?? 4,
  };
}

export async function getLeague(id) {
  return one("SELECT * FROM leagues WHERE id = ?", [id]);
}

export async function getMember(leagueId, userId) {
  return one("SELECT * FROM league_members WHERE league_id = ? AND user_id = ?", [leagueId, userId]);
}

export async function listMembers(leagueId) {
  return all(
    `SELECT m.*, u.display_name
       FROM league_members m JOIN users u ON u.id = m.user_id
      WHERE m.league_id = ? ORDER BY m.joined_at ASC`,
    [leagueId]
  );
}

export async function createInvite(leagueId, userId) {
  const code = randomBytes(5).toString("hex").toUpperCase(); // 10 chars
  await q(
    "INSERT INTO invites (id, league_id, code, created_by, created_at, revoked) VALUES (?, ?, ?, ?, ?, 0)",
    [newId(), leagueId, code, userId, now()]
  );
  return code;
}

export async function leagueForInvite(code) {
  const inv = await one("SELECT * FROM invites WHERE code = ? AND revoked = 0", [String(code).toUpperCase()]);
  if (!inv) return null;
  return getLeague(inv.league_id);
}

// Round-robin schedule (circle method). Odd member counts get a bye entry
// (member_b NULL = bye week for member_a's opponent slot - we simply skip
// pairing the bye and record no matchup for the resting member).
export function roundRobinRounds(memberIds) {
  const ids = [...memberIds];
  if (ids.length % 2 === 1) ids.push(null);
  const n = ids.length;
  const rounds = [];
  let arr = [...ids];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a && b) pairs.push([a, b]);
    }
    rounds.push(pairs);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return rounds;
}

// Generate the regular-season head-to-head schedule from member order.
// Repeats the round-robin if regularWeeks exceeds one full cycle.
export async function generateSchedule(league) {
  const members = await listMembers(league.id);
  const settings = leagueSettings(league);
  const ids = members.map((m) => m.id);
  const base = roundRobinRounds(ids);
  await q("DELETE FROM weekly_matchups WHERE league_id = ? AND is_playoff = 0", [league.id]);
  for (let week = 1; week <= settings.regularWeeks; week++) {
    const pairs = base[(week - 1) % base.length];
    for (const [a, b] of pairs) {
      await q(
        "INSERT INTO weekly_matchups (id, league_id, week, member_a, member_b, is_playoff) VALUES (?, ?, ?, ?, ?, 0)",
        [newId(), league.id, week, a, b]
      );
    }
  }
  for (const m of members) {
    await q(
      `INSERT INTO standings (id, league_id, member_id, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(league_id, member_id) DO NOTHING`,
      [newId(), league.id, m.id, now()]
    );
  }
}

// Playoff bracket: top N seeds, single elimination across the final weeks.
// Week regularWeeks+1 = semifinals, +2 = final (for 4 teams). Winners are
// resolved when those weeks are scored; this creates the seeded round.
export async function generatePlayoffs(league) {
  const settings = leagueSettings(league);
  const table = await all(
    "SELECT * FROM standings WHERE league_id = ? ORDER BY wins DESC, points_for DESC",
    [league.id]
  );
  const seeds = table.slice(0, settings.playoffTeams).map((s) => s.member_id);
  if (seeds.length < 2) return null;
  const week = settings.regularWeeks + 1;
  await q("DELETE FROM weekly_matchups WHERE league_id = ? AND is_playoff = 1 AND week = ?", [league.id, week]);
  // Standard seeding: 1v4, 2v3 (for 4); pairs fold for other sizes.
  const pairs = [];
  const s = [...seeds];
  while (s.length >= 2) {
    pairs.push([s.shift(), s.pop()]);
  }
  for (const [a, b] of pairs) {
    await q(
      "INSERT INTO weekly_matchups (id, league_id, week, member_a, member_b, is_playoff) VALUES (?, ?, ?, ?, ?, 1)",
      [newId(), league.id, week, a, b]
    );
  }
  await q("UPDATE leagues SET status = 'playoffs' WHERE id = ?", [league.id]);
  await logEvent(league.id, "playoffs_generated", { week, seeds });
  return { week, pairs };
}

// Score one fantasy week: every starter in every member's lineup earns from
// their pro matches in that fantasy week. A fantasy week maps to pro matches
// by matches.week within the league's season. Idempotent: re-scoring a week
// replaces its scores and recomputes standings from scratch.
export async function scoreWeek(league, week) {
  const settings = leagueSettings(league);
  const scoring = settings.scoring;
  if (!league.season_id) throw Object.assign(new Error("League has no competition attached."), { status: 400, expose: true });

  const matches = await all("SELECT * FROM matches WHERE season_id = ? AND week = ?", [league.season_id, week]);
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const stats = matches.length
    ? await all(
        `SELECT pms.*, p.pro_team_id
           FROM player_match_stats pms JOIN players p ON p.id = pms.player_id
          WHERE pms.match_id IN (${matches.map(() => "?").join(",")})`,
        matches.map((m) => m.id)
      )
    : [];
  // Score each player's week PER SERIES, then sum: per-series scoring is
  // what makes the win and carry bonuses mean what the table says. Stat
  // lines arrive per map (the game produces them per map), so a player's
  // map lines within one series are first summed into a single series
  // line: the bonuses then fire once per series, on series totals,
  // never once per map.
  const seriesLines = new Map();
  for (const s of stats) {
    const key = `${s.match_id}:${s.player_id}`;
    const line = seriesLines.get(key) || {
      match_id: s.match_id, player_id: s.player_id, pro_team_id: s.pro_team_id,
      eliminations: 0, deaths: 0, assists: 0, final_hits: 0,
      damage_dealt: 0, damage_blocked: 0, healing: 0,
    };
    for (const f of ["eliminations", "deaths", "assists", "final_hits", "damage_dealt", "damage_blocked", "healing"]) {
      line[f] += s[f] || 0;
    }
    seriesLines.set(key, line);
  }
  const agg = new Map();
  for (const s of seriesLines.values()) {
    const m = matchById.get(s.match_id);
    const won =
      (s.pro_team_id === m.team_a_id && (m.score_a ?? -1) > (m.score_b ?? -1)) ||
      (s.pro_team_id === m.team_b_id && (m.score_b ?? -1) > (m.score_a ?? -1));
    const { points } = scoreStatLine(scoring, s, won);
    const cur = agg.get(s.player_id) || {
      points: 0, series: 0, wins: 0,
      eliminations: 0, deaths: 0, assists: 0, final_hits: 0,
      damage_dealt: 0, damage_blocked: 0, healing: 0,
    };
    cur.points += points;
    cur.series += 1;
    if (won) cur.wins += 1;
    for (const f of ["eliminations", "deaths", "assists", "final_hits", "damage_dealt", "damage_blocked", "healing"]) {
      cur[f] += s[f] || 0;
    }
    agg.set(s.player_id, cur);
  }

  // Effective starters per member: their lineup for this week, else the
  // most recent earlier lineup (lineups carry forward), else a default
  // built from roster order (draft order, role-fitted where possible).
  const members = await listMembers(league.id);
  const lineups = [];
  for (const m of members) {
    let rows = await all(
      "SELECT * FROM lineups WHERE league_id = ? AND member_id = ? AND week = ? AND slot != 'BENCH'",
      [league.id, m.id, week]
    );
    if (!rows.length) {
      const prior = await one(
        "SELECT MAX(week) AS w FROM lineups WHERE league_id = ? AND member_id = ? AND week < ?",
        [league.id, m.id, week]
      );
      if (prior && prior.w) {
        rows = await all(
          "SELECT * FROM lineups WHERE league_id = ? AND member_id = ? AND week = ? AND slot != 'BENCH'",
          [league.id, m.id, prior.w]
        );
      }
    }
    if (!rows.length) rows = await defaultLineup(league, m.id);
    lineups.push(...rows);
  }
  await q("DELETE FROM weekly_player_scores WHERE league_id = ? AND week = ?", [league.id, week]);
  await q("DELETE FROM weekly_squad_scores WHERE league_id = ? AND week = ?", [league.id, week]);
  const memberTotals = new Map();
  for (const lu of lineups) {
    const line = agg.get(lu.player_id);
    const total = line ? line.points : 0;
    const finalBreakdown = line
      ? { series: line.series, seriesWon: line.wins, stats: line }
      : { series: 0, seriesWon: 0, stats: null };
    await q(
      "INSERT INTO weekly_player_scores (id, league_id, week, member_id, player_id, points, breakdown) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [newId(), league.id, week, lu.member_id, lu.player_id, Math.round(total * 100) / 100, JSON.stringify(finalBreakdown)]
    );
    memberTotals.set(lu.member_id, (memberTotals.get(lu.member_id) || 0) + total);
  }

  // Squad slot: each member's drafted pro org scores its own series.
  const squadClaims = await all(
    "SELECT * FROM roster_entries WHERE league_id = ? AND pro_team_id IS NOT NULL",
    [league.id]
  );
  const squadScoring = { ...SQUAD_SCORING, ...(settings.squadScoring || {}) };
  for (const claim of squadClaims) {
    const series = [];
    for (const m of matches) {
      if (m.score_a == null || m.score_b == null) continue;
      if (m.team_a_id === claim.pro_team_id) series.push({ mapsFor: m.score_a, mapsAgainst: m.score_b });
      else if (m.team_b_id === claim.pro_team_id) series.push({ mapsFor: m.score_b, mapsAgainst: m.score_a });
    }
    const { points, breakdown } = scoreSquadWeek(squadScoring, series);
    await q(
      "INSERT INTO weekly_squad_scores (id, league_id, week, member_id, pro_team_id, points, breakdown) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [newId(), league.id, week, claim.member_id, claim.pro_team_id, points, JSON.stringify(breakdown)]
    );
    memberTotals.set(claim.member_id, (memberTotals.get(claim.member_id) || 0) + points);
  }

  const matchups = await all(
    "SELECT * FROM weekly_matchups WHERE league_id = ? AND week = ?",
    [league.id, week]
  );
  for (const mu of matchups) {
    const sa = Math.round((memberTotals.get(mu.member_a) || 0) * 100) / 100;
    const sb = mu.member_b ? Math.round((memberTotals.get(mu.member_b) || 0) * 100) / 100 : null;
    await q(
      "UPDATE weekly_matchups SET score_a = ?, score_b = ?, scored_at = ? WHERE id = ?",
      [sa, sb, now(), mu.id]
    );
  }
  await recomputeStandings(league.id);

  // Playoff advancement: when a playoff round is scored and exactly two
  // winners emerge, seed the next round (the final) from them. Re-scoring
  // is safe - the next round is only created if it doesn't exist yet.
  const scoredNow = await all(
    "SELECT * FROM weekly_matchups WHERE league_id = ? AND week = ? AND scored_at IS NOT NULL",
    [league.id, week]
  );
  const playoffRound = scoredNow.filter((m) => m.is_playoff);
  if (playoffRound.length) {
    const winners = playoffRound.map((mu) =>
      (mu.score_a ?? 0) >= (mu.score_b ?? 0) ? mu.member_a : mu.member_b
    );
    if (winners.length === 2) {
      const existing = await all(
        "SELECT * FROM weekly_matchups WHERE league_id = ? AND week = ?",
        [league.id, week + 1]
      );
      if (!existing.length) {
        await q(
          "INSERT INTO weekly_matchups (id, league_id, week, member_a, member_b, is_playoff) VALUES (?, ?, ?, ?, ?, 1)",
          [newId(), league.id, week + 1, winners[0], winners[1]]
        );
        await logEvent(league.id, "playoff_final_seeded", { week: week + 1, winners });
      }
    } else if (winners.length === 1) {
      await logEvent(league.id, "champion", { member: winners[0], week });
    }
  }

  await logEvent(league.id, "week_scored", { week, matchups: matchups.length });
  return { week, matchups: matchups.length, memberTotals: Object.fromEntries(memberTotals) };
}

// Default starters from a member's roster (used when no lineup was set):
// best-ranked player per locked role slot, then best remaining as FLEX.
export async function defaultLineup(league, memberId) {
  const settings = leagueSettings(league);
  const roster = await all(
    `SELECT re.player_id, p.role, p.draft_rank
       FROM roster_entries re JOIN players p ON p.id = re.player_id
      WHERE re.league_id = ? AND re.member_id = ? ORDER BY p.draft_rank ASC`,
    [league.id, memberId]
  );
  const used = new Set();
  const rows = [];
  for (const slotDef of settings.roster.slots) {
    for (let i = 0; i < slotDef.count; i++) {
      const pick = roster.find(
        (r) => !used.has(r.player_id) && (!slotDef.role || r.role === slotDef.role)
      );
      if (pick) {
        used.add(pick.player_id);
        rows.push({ league_id: league.id, member_id: memberId, player_id: pick.player_id, slot: slotDef.slot });
      }
    }
  }
  return rows;
}

export async function recomputeStandings(leagueId) {
  const members = await listMembers(leagueId);
  const scored = await all(
    "SELECT * FROM weekly_matchups WHERE league_id = ? AND scored_at IS NOT NULL",
    [leagueId]
  );
  const table = new Map(
    members.map((m) => [m.id, { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }])
  );
  for (const mu of scored) {
    const a = table.get(mu.member_a);
    if (!a) continue;
    a.pf += mu.score_a || 0;
    a.pa += mu.score_b || 0;
    if (mu.member_b) {
      const b = table.get(mu.member_b);
      if (b) { b.pf += mu.score_b || 0; b.pa += mu.score_a || 0; }
      if (mu.score_a > mu.score_b) { a.wins++; if (b) b.losses++; }
      else if (mu.score_a < mu.score_b) { a.losses++; if (b) b.wins++; }
      else { a.ties++; if (b) b.ties++; }
    } else {
      a.wins++; // bye counts as a win for the resting member's opponent slot
    }
  }
  for (const [memberId, t] of table) {
    await q(
      `INSERT INTO standings (id, league_id, member_id, wins, losses, ties, points_for, points_against, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(league_id, member_id) DO UPDATE SET
         wins = excluded.wins, losses = excluded.losses, ties = excluded.ties,
         points_for = excluded.points_for, points_against = excluded.points_against,
         updated_at = excluded.updated_at`,
      [newId(), leagueId, memberId, t.wins, t.losses, t.ties,
       Math.round(t.pf * 100) / 100, Math.round(t.pa * 100) / 100, now()]
    );
  }
  return [...table.entries()].map(([member_id, t]) => ({ member_id, ...t }));
}
