// scoring.js - the fantasy scoring table and week scoring engine.
// Defaults are modelled on Fantasy LCS (Riot's official LoL fantasy game:
// kills 2, deaths -0.5, assists 1.5, objective/role stats scaled) translated
// to hero-shooter stat lines. Every league can override the table in its
// settings; this is the default that ships in data/v1/scoring.json too.

export const DEFAULT_SCORING = {
  // Anchored to Fantasy LCS's published 2015 values where they translate
  // (kill 2, death -0.5, assist 1.5 - see RESEARCH.md), extended with the
  // hero-shooter stat lines Liquipedia actually publishes per map.
  eliminations: 2.0,
  assists: 1.5,
  deaths: -0.5,
  finalHits: 0.5,
  damageDealtPer1000: 1.0,
  damageBlockedPer2000: 1.0,
  healingPer1000: 1.0,
  matchWin: 2.0, // per series won by the player's pro team (LCS "win" analogue)
  carryGame: 2.0, // bonus for a 25+ elimination series (LCS 10+ K/A analogue)
  carryGameThreshold: 25,
};

// The Squad slot - our translation of the Fantasy LCS "Team" item
// (towers 1 / dragon 2 / baron 2 / first blood 2 / win 2 / fast win +2).
// A member drafts one pro org; it scores that org's series all season.
export const SQUAD_SCORING = {
  mapWin: 1.0,
  seriesWin: 2.0,
  sweepBonus: 2.0, // series won without dropping a map
};

export function scoreSquadWeek(scoring, series) {
  // series: [{ mapsFor, mapsAgainst }] for the org in this fantasy week.
  let points = 0;
  const b = { mapWins: 0, seriesWins: 0, sweeps: 0 };
  for (const s of series) {
    points += s.mapsFor * scoring.mapWin;
    b.mapWins += s.mapsFor;
    if (s.mapsFor > s.mapsAgainst) {
      points += scoring.seriesWin;
      b.seriesWins += 1;
      if (s.mapsAgainst === 0) {
        points += scoring.sweepBonus;
        b.sweeps += 1;
      }
    }
  }
  return { points: Math.round(points * 100) / 100, breakdown: b };
}

export const STAT_FIELDS = [
  "eliminations",
  "deaths",
  "assists",
  "final_hits",
  "damage_dealt",
  "damage_blocked",
  "healing",
];

export function mergeScoring(overrides = {}) {
  return { ...DEFAULT_SCORING, ...overrides };
}

// Points for one player's stat line in one series. `won` = their pro team
// won that series. Returns the breakdown so the UI can show its work.
export function scoreStatLine(scoring, line, won) {
  const b = {
    eliminations: line.eliminations * scoring.eliminations,
    assists: line.assists * scoring.assists,
    deaths: line.deaths * scoring.deaths,
    finalHits: line.final_hits * scoring.finalHits,
    damageDealt: (line.damage_dealt / 1000) * scoring.damageDealtPer1000,
    damageBlocked: (line.damage_blocked / 2000) * scoring.damageBlockedPer2000,
    healing: (line.healing / 1000) * scoring.healingPer1000,
    matchWin: won ? scoring.matchWin : 0,
    carryGame: line.eliminations >= scoring.carryGameThreshold ? scoring.carryGame : 0,
  };
  const total = Object.values(b).reduce((a, v) => a + v, 0);
  return { points: Math.round(total * 100) / 100, breakdown: b };
}

// Roster construction (defaults; leagues may override counts in settings).
export const DEFAULT_ROSTER = {
  slots: [
    { slot: "VAN", role: "Vanguard", count: 1 },
    { slot: "DUE", role: "Duelist", count: 1 },
    { slot: "STR", role: "Strategist", count: 1 },
    { slot: "FLEX", role: null, count: 2 },
  ],
  bench: 3,
};

export function rosterSize(roster = DEFAULT_ROSTER) {
  return roster.slots.reduce((a, s) => a + s.count, 0) + roster.bench;
}

// Validate a lineup: every rostered player assigned exactly once, starter
// slots filled per role rules, bench gets the rest.
export function validateLineup(roster, assignments, playersById) {
  const errors = [];
  const starterSlots = [];
  for (const s of roster.slots) {
    for (let i = 0; i < s.count; i++) starterSlots.push(s);
  }
  const starters = assignments.filter((a) => a.slot !== "BENCH");
  const bench = assignments.filter((a) => a.slot === "BENCH");
  if (starters.length !== starterSlots.length) {
    errors.push(`Lineup needs exactly ${starterSlots.length} starters (has ${starters.length}).`);
  }
  if (bench.length > roster.bench) {
    errors.push(`Bench holds at most ${roster.bench} (has ${bench.length}).`);
  }
  const usedSlots = {};
  for (const a of starters) {
    const def = roster.slots.find((s) => s.slot === a.slot);
    if (!def) { errors.push(`Unknown slot ${a.slot}.`); continue; }
    usedSlots[a.slot] = (usedSlots[a.slot] || 0) + 1;
    if (usedSlots[a.slot] > def.count) errors.push(`Too many players in ${a.slot}.`);
    const player = playersById[a.player_id];
    if (player && def.role && player.role !== def.role) {
      errors.push(`${player.ign} is a ${player.role}, not a ${def.role}.`);
    }
  }
  const seen = new Set();
  for (const a of assignments) {
    if (seen.has(a.player_id)) errors.push("A player can only appear once in a lineup.");
    seen.add(a.player_id);
  }
  return errors;
}
