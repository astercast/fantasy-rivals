// draft.js - snake draft engine. The pick clock is enforced lazily: any
// read or pick first advances expired picks with an auto-pick (best
// available by draft_rank). That keeps the draft correct on serverless
// without a background timer.

import { newId, q, one, all } from "./db.js";
import { leagueSettings, logEvent, generateSchedule, now } from "./league.js";
import { rosterSize } from "./scoring.js";

export async function getDraft(leagueId) {
  return one("SELECT * FROM drafts WHERE league_id = ?", [leagueId]);
}

export function memberOnClock(draft, pickNo) {
  const order = JSON.parse(draft.order_json);
  const n = order.length;
  const round = Math.floor(pickNo / n) + 1;
  const pos = pickNo % n;
  const memberId = round % 2 === 1 ? order[pos] : order[n - 1 - pos];
  return { memberId, round };
}

// Draft shape: one round per roster spot, then a final SQUAD round where
// each member claims one pro org (the Team-slot translation). Total rounds
// = roster spots + 1.
export function draftRounds(league) {
  return rosterSize(leagueSettings(league).roster) + 1;
}

export function totalPicks(draft, league) {
  const order = JSON.parse(draft.order_json);
  return order.length * draftRounds(league);
}

export function isSquadPick(draft, league, pickNo) {
  const order = JSON.parse(draft.order_json);
  const round = Math.floor(pickNo / order.length) + 1;
  return round === draftRounds(league);
}

export async function startDraft(league) {
  const members = await all(
    "SELECT * FROM league_members WHERE league_id = ? ORDER BY joined_at ASC",
    [league.id]
  );
  if (members.length < 2) {
    throw Object.assign(new Error("A draft needs at least 2 teams."), { status: 400, expose: true });
  }
  const order = members.map((m) => m.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const settings = leagueSettings(league);
  const deadline = new Date(Date.now() + settings.pickClockSeconds * 1000).toISOString();
  const existing = await getDraft(league.id);
  if (existing) {
    await q("DELETE FROM draft_picks WHERE draft_id = ?", [existing.id]);
    await q("DELETE FROM roster_entries WHERE league_id = ?", [league.id]);
    await q(
      "UPDATE drafts SET status = 'live', order_json = ?, current_pick = 0, pick_deadline = ?, started_at = ?, finished_at = NULL WHERE id = ?",
      [JSON.stringify(order), deadline, now(), existing.id]
    );
  } else {
    await q(
      "INSERT INTO drafts (id, league_id, status, order_json, current_pick, pick_deadline, started_at) VALUES (?, ?, 'live', ?, 0, ?, ?)",
      [newId(), league.id, JSON.stringify(order), deadline, now()]
    );
  }
  await q("UPDATE leagues SET status = 'drafting' WHERE id = ?", [league.id]);
  await logEvent(league.id, "draft_started", { order });
  return getDraft(league.id);
}

async function bestAvailable(league, draft) {
  const rows = await all(
    `SELECT p.* FROM players p
      WHERE p.game_id = ? AND p.active = 1
        AND p.id NOT IN (SELECT player_id FROM draft_picks WHERE draft_id = ?)
      ORDER BY p.draft_rank ASC LIMIT 1`,
    [league.game_id, draft.id]
  );
  return rows[0] || null;
}

async function bestAvailableSquad(league, draft) {
  const rows = await all(
    `SELECT t.* FROM pro_teams t
      WHERE t.game_id = ?
        AND t.id NOT IN (SELECT pro_team_id FROM draft_picks WHERE draft_id = ? AND pro_team_id IS NOT NULL)
      ORDER BY t.name ASC LIMIT 1`,
    [league.game_id, draft.id]
  );
  return rows[0] || null;
}

// pick: { player } for player rounds, { squad } for the squad round.
async function applyPick(league, draft, memberId, pick, auto) {
  const pickNo = draft.current_pick;
  const { round } = memberOnClock(draft, pickNo);
  await q(
    "INSERT INTO draft_picks (id, draft_id, pick_no, round, member_id, player_id, pro_team_id, picked_at, auto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [newId(), draft.id, pickNo, round, memberId,
     pick.player ? pick.player.id : null,
     pick.squad ? pick.squad.id : null,
     now(), auto ? 1 : 0]
  );
  await q(
    "INSERT INTO roster_entries (id, league_id, member_id, player_id, pro_team_id, acquired_via) VALUES (?, ?, ?, ?, ?, 'draft')",
    [newId(), league.id, memberId,
     pick.player ? pick.player.id : null,
     pick.squad ? pick.squad.id : null]
  );
  const settings = leagueSettings(league);
  const nextPick = pickNo + 1;
  const total = totalPicks(draft, league);
  if (nextPick >= total) {
    await q(
      "UPDATE drafts SET status = 'complete', current_pick = ?, pick_deadline = NULL, finished_at = ? WHERE id = ?",
      [nextPick, now(), draft.id]
    );
    await q("UPDATE leagues SET status = 'active' WHERE id = ?", [league.id]);
    await generateSchedule(league);
    await logEvent(league.id, "draft_complete", { picks: total });
  } else {
    const deadline = new Date(Date.now() + settings.pickClockSeconds * 1000).toISOString();
    await q("UPDATE drafts SET current_pick = ?, pick_deadline = ? WHERE id = ?", [nextPick, deadline, draft.id]);
  }
  return getDraft(league.id);
}

// Advance any expired picks. Returns the (possibly updated) draft.
export async function advanceExpired(league, draft) {
  let d = draft;
  let guard = 0;
  while (
    d && d.status === "live" && d.pick_deadline &&
    Date.parse(d.pick_deadline) < Date.now() && guard++ < 500
  ) {
    const { memberId } = memberOnClock(d, d.current_pick);
    if (isSquadPick(d, league, d.current_pick)) {
      const squad = await bestAvailableSquad(league, d);
      if (!squad) break;
      d = await applyPick(league, d, memberId, { squad }, true);
      await logEvent(league.id, "draft_auto_pick", { squad: squad.name, member: memberId });
    } else {
      const player = await bestAvailable(league, d);
      if (!player) break;
      d = await applyPick(league, d, memberId, { player }, true);
      await logEvent(league.id, "draft_auto_pick", { player: player.ign, member: memberId });
    }
  }
  return d;
}

export async function makePick(league, draft, memberId, { playerId = null, proTeamId = null } = {}) {
  const d = await advanceExpired(league, draft);
  if (!d || d.status !== "live") {
    throw Object.assign(new Error("The draft is not live."), { status: 409, expose: true });
  }
  const turn = memberOnClock(d, d.current_pick);
  if (turn.memberId !== memberId) {
    throw Object.assign(new Error("It is not your pick."), { status: 403, expose: true });
  }
  if (isSquadPick(d, league, d.current_pick)) {
    if (!proTeamId) {
      throw Object.assign(new Error("This is the squad round - pick a pro team."), { status: 400, expose: true });
    }
    const squad = await one("SELECT * FROM pro_teams WHERE id = ? AND game_id = ?", [proTeamId, league.game_id]);
    if (!squad) {
      throw Object.assign(new Error("Pro team not found."), { status: 404, expose: true });
    }
    const taken = await one("SELECT id FROM draft_picks WHERE draft_id = ? AND pro_team_id = ?", [d.id, proTeamId]);
    if (taken) {
      throw Object.assign(new Error("That squad has already been claimed."), { status: 409, expose: true });
    }
    const updated = await applyPick(league, d, memberId, { squad }, false);
    await logEvent(league.id, "draft_pick", { squad: squad.name, member: memberId, pick: d.current_pick });
    return updated;
  }
  if (!playerId) {
    throw Object.assign(new Error("Pick a player."), { status: 400, expose: true });
  }
  const player = await one("SELECT * FROM players WHERE id = ? AND game_id = ? AND active = 1", [playerId, league.game_id]);
  if (!player) {
    throw Object.assign(new Error("Player not found in this game's pool."), { status: 404, expose: true });
  }
  const taken = await one("SELECT id FROM draft_picks WHERE draft_id = ? AND player_id = ?", [d.id, playerId]);
  if (taken) {
    throw Object.assign(new Error("That player has already been drafted."), { status: 409, expose: true });
  }
  const updated = await applyPick(league, d, memberId, { player }, false);
  await logEvent(league.id, "draft_pick", { player: player.ign, member: memberId, pick: d.current_pick });
  return updated;
}

export async function draftState(league) {
  let draft = await getDraft(league.id);
  if (draft && draft.status === "live") {
    draft = await advanceExpired(league, draft);
  }
  if (!draft) return { draft: null };
  const picks = await all(
    `SELECT dp.*, p.ign, p.role, m.team_name, t.name AS squad_name
       FROM draft_picks dp
       LEFT JOIN players p ON p.id = dp.player_id
       LEFT JOIN pro_teams t ON t.id = dp.pro_team_id
       JOIN league_members m ON m.id = dp.member_id
      WHERE dp.draft_id = ? ORDER BY dp.pick_no ASC`,
    [draft.id]
  );
  const total = totalPicks(draft, league);
  const onClock = draft.status === "live" ? memberOnClock(draft, draft.current_pick) : null;
  return {
    draft: {
      id: draft.id,
      status: draft.status,
      order: JSON.parse(draft.order_json),
      currentPick: draft.current_pick,
      totalPicks: total,
      rounds: draftRounds(league),
      pickDeadline: draft.pick_deadline,
      onClock,
      onClockPickKind:
        draft.status === "live"
          ? isSquadPick(draft, league, draft.current_pick) ? "squad" : "player"
          : null,
    },
    picks,
  };
}
