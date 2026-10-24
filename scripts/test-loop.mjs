// test-loop.mjs - the full local-loop proof, over real HTTP against the
// dev server on a throwaway DB:
//   dev OAuth sign-in → email signup ×4 → league FOR a named competition
//   → invite/join ×3 → snake draft (36 picks incl. squad round) → lineups
//   → labelled DEMO results import → score 3 weeks → standings move →
//   playoffs → final → league complete with a champion.
// Prints a transcript; exits non-zero at the first failed assertion.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4317;
const BASE = `http://localhost:${PORT}`;
const IMPORT_KEY = "loop-test-key";
const tmp = mkdtempSync(join(tmpdir(), "rf-loop-"));
const DB = join(tmp, "loop.db");

const server = spawn("node", ["scripts/dev-server.mjs"], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(PORT),
    RF_DB_PATH: DB,
    RF_DEV_AUTH: "1",
    ADMIN_IMPORT_KEY: IMPORT_KEY,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

let step = 0;
function ok(cond, label, extra = "") {
  step++;
  if (!cond) {
    console.error(`\nFAIL at step ${step}: ${label} ${extra}`);
    console.error("--- server log ---\n" + serverLog.slice(-3000));
    cleanup(1);
  }
  console.log(`  ✓ ${label}`);
}
function cleanup(code) {
  try { server.kill("SIGTERM"); } catch {}
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  process.exit(code);
}

class Client {
  constructor(name) { this.name = name; this.cookies = new Map(); }
  async req(method, path, body, headers = {}) {
    const res = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        Cookie: [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const m = setCookie.match(/(rf_session)=([^;]+)/);
      if (m) this.cookies.set(m[1], m[2]);
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, headers: res.headers, json, text };
  }
  get(p) { return this.req("GET", p); }
  post(p, b, h) { return this.req("POST", p, b, h); }
}

// Deterministic pseudo-random stat lines (labelled DEMO at import).
function rng(seed) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}
function statLine(ign, role, week) {
  const seed = [...ign].reduce((a, c) => a + c.charCodeAt(0) * 31, 7) + week * 101;
  const r = rng(seed);
  const line = {
    playerIgn: ign,
    eliminations: 10 + Math.floor(r() * 20),
    deaths: 5 + Math.floor(r() * 9),
    assists: 7 + Math.floor(r() * 14),
    finalHits: 3 + Math.floor(r() * 10),
    damageDealt: 8000 + Math.floor(r() * 14000),
    damageBlocked: 1500 + Math.floor(r() * 4000),
    healing: 800 + Math.floor(r() * 2500),
  };
  if (role === "Vanguard") line.damageBlocked = 6000 + Math.floor(r() * 11000);
  if (role === "Strategist") {
    line.healing = 9000 + Math.floor(r() * 11000);
    line.eliminations = 5 + Math.floor(r() * 9);
  }
  if (role === "Duelist") line.finalHits = 8 + Math.floor(r() * 12);
  return line;
}

try {
  // - boot -
  let health = null;
  for (let i = 0; i < 60 && !health; i++) {
    try {
      const r = await fetch(BASE + "/api/health");
      if (r.ok) health = await r.json();
    } catch {}
    if (!health) await new Promise((r) => setTimeout(r, 500));
  }
  ok(health && health.ok, "dev server boots; health endpoint answers", JSON.stringify(health));

  // - dev OAuth round trip -
  const dev = new Client("dev");
  const start = await dev.get("/api/auth/oauth-start?provider=dev");
  ok(start.status === 302 && start.headers.get("location"), "dev OAuth start redirects to the callback");
  const cb = await dev.get(start.headers.get("location"));
  ok(cb.status === 302 || cb.status === 200, "dev OAuth callback completes", `status ${cb.status}`);
  const meDev = await dev.get("/api/auth/me");
  const devName = meDev.json?.user?.displayName || meDev.json?.displayName;
  ok(devName === "Dev Player", "dev OAuth session signs in as Dev Player", JSON.stringify(meDev.json));

  // - email signups ×4 -
  const names = ["Alpha", "Bravo", "Comet", "Drift"];
  const clients = [];
  for (let i = 0; i < 4; i++) {
    const c = new Client(names[i]);
    const r = await c.post("/api/auth/signup", {
      email: `loop${i + 1}@test.local`,
      displayName: `Loop ${names[i]}`,
      password: `loop-password-${i + 1}`,
    });
    ok(r.status === 201 && r.json.user, `signup ${names[i]}`, r.text.slice(0, 200));
    clients.push(c);
  }
  const [A, B, C, D] = clients;

  // - competition picker data -
  // TY1: states are computed from dates, never flags — so this test
  // derives every expected state from the competition's own window on
  // today's clock (the same rule api/leagues/meta.js documents)
  // instead of hard-coding whichever stage was live when the test was
  // written. The league below still runs on Stage 2: creation takes
  // any real competition, and the demo-results import is Stage 2's.
  const meta = await A.get("/api/leagues/meta");
  const todayStr = new Date().toISOString().slice(0, 10);
  const deriveState = (c) => (c.startsOn && c.endsOn)
    ? (todayStr < c.startsOn ? "upcoming" : todayStr > c.endsOn ? "complete" : "live")
    : c.state;
  const dated = meta.json.competitions.filter((c) => c.startsOn && c.endsOn);
  ok(dated.length > 0 && dated.every((c) => c.state === deriveState(c)),
    "meta computes every dated competition's state from its window",
    JSON.stringify(meta.json.competitions.map((c) => [c.name, c.state])));
  const stage2 = meta.json.competitions.find((c) => /Stage 2/.test(c.name));
  ok(stage2 && stage2.state === deriveState(stage2),
    `meta names Ignite Stage 2 by the calendar (${stage2 ? deriveState(stage2) : "?"} on ${todayStr})`,
    JSON.stringify(stage2?.state));
  ok(meta.json.competitions.some((c) => c.state === "upcoming") ===
     dated.some((c) => deriveState(c) === "upcoming"),
    "meta also names the NEXT competition when the calendar has one");

  // - create league FOR Stage 2 -
  const created = await A.post("/api/leagues", {
    name: "Loop Test League",
    seasonId: stage2.id,
    teamName: "Alpha",
    size: 4,
    settings: { regularWeeks: 3, pickClockSeconds: 30 },
  });
  ok(created.status === 201 && created.json.league?.id, "commissioner creates a league for Stage 2", created.text.slice(0, 200));
  const leagueId = created.json.league.id;
  const inviteCode = created.json.inviteCode;
  ok(!!inviteCode, "league issues an invite code");

  // - regression: the Draft tab of a FORMING league (no draft row yet).
  //    A first-time commissioner opens it before anyone joins or starts
  //    anything. It must answer 200 with the honest not-started state
  //    (draft null, empty picks, the full pool), never a 500 - the
  //    draftState no-draft shape once omitted `picks` and the GET
  //    handler's state.picks.map threw (fixed 2026-10-15). -
  const formingDraft = await A.get(`/api/leagues/draft?leagueId=${leagueId}`);
  ok(formingDraft.status === 200 && formingDraft.json.draft === null &&
     Array.isArray(formingDraft.json.picks) && formingDraft.json.picks.length === 0,
    "forming league's Draft tab answers 200 with draft null and zero picks",
    `status=${formingDraft.status} body=${formingDraft.text.slice(0, 200)}`);
  ok(Array.isArray(formingDraft.json.pool) && formingDraft.json.pool.length > 0 &&
     Array.isArray(formingDraft.json.squads) && formingDraft.json.squads.length > 0,
    "forming league's draft read carries the full pool and squads");

  // - join ×3 -
  for (const [i, c] of [B, C, D].entries()) {
    const r = await c.post("/api/leagues/join", { code: inviteCode, teamName: names[i + 1] });
    ok(r.status === 200 && r.json.members?.length === i + 2, `${names[i + 1]} joins via invite`, r.text.slice(0, 150));
  }

  // - draft -
  const startDraft = await A.post("/api/leagues/draft", { leagueId, action: "start" });
  ok(startDraft.status === 200 && startDraft.json.draft?.status === "live", "commissioner starts the snake draft");
  const memberClient = new Map(); // memberId -> client
  const roleCount = new Map(); // memberId -> {players, VAN, DUE, STR}
  for (const c of clients) {
    const g = await c.get(`/api/leagues/get?id=${leagueId}`);
    memberClient.set(g.json.me.id, c);
    roleCount.set(g.json.me.id, { players: 0, Vanguard: 0, Duelist: 0, Strategist: 0 });
  }
  let playerInfo = new Map(); // playerId -> {ign, role, short}
  const squadShortByName = new Map(); // captured pre-draft: post-draft lists filter claimed squads out
  let picksMade = 0;
  for (let guard = 0; guard < 200; guard++) {
    const st = await A.get(`/api/leagues/draft?leagueId=${leagueId}`);
    const d = st.json.draft;
    if (!d || d.status === "complete") break;
    if (!playerInfo.size) {
      for (const p of st.json.pool) playerInfo.set(p.id, { ign: p.ign, role: p.role, short: p.pro_team_short });
      for (const s of st.json.squads) squadShortByName.set(s.name, s.short);
    } else {
      for (const p of st.json.pool) if (!playerInfo.has(p.id)) playerInfo.set(p.id, { ign: p.ign, role: p.role, short: p.pro_team_short });
    }
    const picker = memberClient.get(d.onClock.memberId);
    const needs = roleCount.get(d.onClock.memberId);
    let body;
    if (d.onClockPickKind === "squad") {
      body = { leagueId, action: "pick", proTeamId: st.json.squads[0].id };
    } else {
      const wantRole = ["Vanguard", "Duelist", "Strategist"].find((r) => needs[r] < 1);
      const pick = st.json.pool.find((p) => p.role === wantRole) || st.json.pool[0];
      body = { leagueId, action: "pick", playerId: pick.id };
      needs[pick.role]++; needs.players++;
    }
    const r = await picker.post("/api/leagues/draft", body);
    if (r.status !== 200) ok(false, `pick ${picksMade + 1} accepted`, r.text.slice(0, 200));
    picksMade++;
  }
  const draftEnd = await A.get(`/api/leagues/draft?leagueId=${leagueId}`);
  ok(draftEnd.json.draft.status === "complete" && picksMade === 36,
    `snake draft completes - 36 picks (32 players + 4 squads)`, `picks=${picksMade}`);
  const leagueAfterDraft = await A.get(`/api/leagues/get?id=${leagueId}`);
  ok(leagueAfterDraft.json.league.status === "active", "league flips to active after the draft");
  ok(leagueAfterDraft.json.myRoster.length === 9, "each roster holds 8 players + 1 squad");

  // - lineups for week 1 (before results exist, so nothing is locked) -
  for (const c of clients) {
    const lu = await c.get(`/api/leagues/lineup?leagueId=${leagueId}&week=1`);
    const roster = lu.json.roster.filter((r) => r.player_id);
    const by = (role) => roster.find((r) => r.role === role);
    const starters = [
      { playerId: by("Vanguard").player_id, slot: "VAN" },
      { playerId: by("Duelist").player_id, slot: "DUE" },
      { playerId: by("Strategist").player_id, slot: "STR" },
    ];
    const used = new Set(starters.map((s) => s.playerId));
    const rest = roster.filter((r) => !used.has(r.player_id));
    starters.push({ playerId: rest[0].player_id, slot: "FLEX" }, { playerId: rest[1].player_id, slot: "FLEX" });
    const assignments = [...starters, ...rest.slice(2).map((r) => ({ playerId: r.player_id, slot: "BENCH" }))];
    const saved = await c.post("/api/leagues/lineup", { leagueId, week: 1, assignments });
    ok(saved.status === 200, `week-1 lineup saved for ${c.name}`, saved.text.slice(0, 150));
  }

  // - demo results: series among the pro teams that have drafted players,
  //    plus every claimed squad's team so the squad slot scores too. -
  const drafted = draftEnd.json.picks.filter((p) => p.player_id);
  const draftedInfo = drafted.map((p) => playerInfo.get(p.player_id)).filter(Boolean);
  const squadShorts = new Set();
  for (const c of clients) {
    const g = await c.get(`/api/leagues/get?id=${leagueId}`);
    const sq = g.json.myRoster.find((r) => !r.player_id && r.pro_team_id);
    if (sq) squadShorts.add(sq.squad_name);
  }
  const teamsSet = new Set(draftedInfo.map((p) => p.short));
  for (const name of squadShorts) {
    const s = squadShortByName.get(name);
    if (s) teamsSet.add(s);
  }
  const teamsArr = [...teamsSet];
  if (teamsArr.length % 2 === 1) {
    teamsArr.push(["TSM", "SSG", "PLS", "BCAT"].find((s) => !teamsSet.has(s)) || "TSM");
  }
  async function importWeek(week) {
    const matches = [];
    for (let i = 0; i < teamsArr.length; i += 2) {
      const a = teamsArr[i], b = teamsArr[i + 1];
      const aWins = (i / 2 + week) % 2 === 0;
      matches.push({
        week,
        teamA: a, teamB: b,
        scoreA: aWins ? 3 : 1, scoreB: aWins ? 1 : 3,
        status: "final",
        startsAt: `2026-10-${String(9 + week)}T17:00:00Z`,
        stats: draftedInfo.filter((p) => p.short === a || p.short === b)
          .map((p) => statLine(p.ign, p.role, week)),
      });
    }
    const r = await A.post("/api/admin/import-results", {
      seasonId: stage2.id,
      source: "DEMO - simulated box scores generated by scripts/test-loop.mjs for product verification. Not real match results.",
      matches,
    }, { "x-import-key": IMPORT_KEY });
    ok(r.status === 200 && r.json.unresolved.length === 0,
      `week ${week} demo results import clean (no unresolved refs)`,
      JSON.stringify(r.json.unresolved?.slice(0, 2) || r.text.slice(0, 200)));
    return r.json;
  }

  // - score the regular season -
  for (let week = 1; week <= 3; week++) {
    await importWeek(week);
    const s = await A.post("/api/leagues/score-week", { leagueId, week, generatePlayoffs: week === 3 });
    ok(s.status === 200 && s.json.matchups === 2, `week ${week} scored (2 matchups)`, s.text.slice(0, 200));
    if (week === 1) {
      const table = await A.get(`/api/leagues/standings?leagueId=${leagueId}&week=1`);
      const decided = table.json.standings.reduce((a, m) => a + m.wins + m.losses + m.ties, 0);
      const pf = table.json.standings.reduce((a, m) => a + m.points_for, 0);
      ok(decided === 4 && pf > 0, "standings move after week 1 (results recorded, points on the board)",
        `decided=${decided} pf=${pf}`);
      const top = table.json.playerScores[0];
      ok(top && top.points > 0, `player scores post (top: ${top?.ign} ${top?.points} pts)`);
    }
  }
  const afterReg = await A.get(`/api/leagues/get?id=${leagueId}`);
  ok(afterReg.json.league.status === "playoffs", "league enters the playoffs after week 3");
  const bracket = await A.get(`/api/leagues/standings?leagueId=${leagueId}&week=4`);
  ok(bracket.json.matchups.filter((m) => m.week === 4 && m.is_playoff).length === 2,
    "semifinal bracket seeded (1v4, 2v3)");

  // - playoffs -
  await importWeek(4);
  const sf = await A.post("/api/leagues/score-week", { leagueId, week: 4 });
  ok(sf.status === 200, "semifinals scored");
  const afterSf = await A.get(`/api/leagues/standings?leagueId=${leagueId}&week=5`);
  ok(afterSf.json.matchups.filter((m) => m.week === 5 && m.is_playoff).length === 1,
    "the final is seeded from the semifinal winners");
  await importWeek(5);
  const fin = await A.post("/api/leagues/score-week", { leagueId, week: 5 });
  ok(fin.status === 200, "the final is scored");
  const done = await A.get(`/api/leagues/get?id=${leagueId}`);
  ok(done.json.league.status === "complete", "league completes after the final");
  const champEvent = done.json.events.find((e) => e.type === "champion");
  const finalTable = await A.get(`/api/leagues/standings?leagueId=${leagueId}&week=5`);
  const champRow = finalTable.json.standings[0];
  ok(!!champRow, `a champion stands atop the table (${champRow?.team_name}, ${champRow?.wins}W-${champRow?.losses}L, ${champRow?.points_for} pts for)`);

  // - per-map stat lines: the shape the real season produces. One series,
  //    one starter, two map lines (30 eliminations on Map 1, none on
  //    Map 2, his team wins the series 2 to 0). The three behaviours
  //    score differently, so the expected total separates them: a
  //    last-map-only overwrite scores 2, scoring each map on its own
  //    scores 66 (the win bonus twice), and the correct series
  //    aggregate scores 64 (60 for 30 eliminations, +2 series win,
  //    +2 carry bonus at 25+ eliminations across the series). -
  let mapPlayer = null;
  for (const c of clients) {
    const lu = await c.get(`/api/leagues/lineup?leagueId=${leagueId}&week=1`);
    const starter = (lu.json.lineup || []).find((r) => r.slot !== "BENCH" && r.player_id);
    if (starter && playerInfo.has(starter.player_id)) { mapPlayer = playerInfo.get(starter.player_id); break; }
  }
  ok(!!mapPlayer, "per-map check finds a week-1 starter to score");
  const mapOpp = teamsArr.find((t) => t !== mapPlayer.short);
  const mapImport = await A.post("/api/admin/import-results", {
    seasonId: stage2.id,
    source: "DEMO - simulated per-map lines generated by scripts/test-loop.mjs for product verification. Not real match results.",
    matches: [{
      week: 9, roundLabel: "Per-map scoring check",
      teamA: mapPlayer.short, teamB: mapOpp,
      scoreA: 2, scoreB: 0, status: "final", startsAt: "2026-10-17T17:00:00Z",
      stats: [
        { playerIgn: mapPlayer.ign, mapLabel: "Map 1", eliminations: 30, deaths: 0, assists: 0, finalHits: 0, damageDealt: 0, damageBlocked: 0, healing: 0 },
        { playerIgn: mapPlayer.ign, mapLabel: "Map 2", eliminations: 0, deaths: 0, assists: 0, finalHits: 0, damageDealt: 0, damageBlocked: 0, healing: 0 },
      ],
    }],
  }, { "x-import-key": IMPORT_KEY });
  ok(mapImport.status === 200 && mapImport.json.statLines === 2 && mapImport.json.unresolved.length === 0,
    "per-map import lands both map lines for one player in one series",
    mapImport.text.slice(0, 200));
  const mapScored = await A.post("/api/leagues/score-week", { leagueId, week: 9 });
  ok(mapScored.status === 200, "per-map week scores", mapScored.text.slice(0, 200));
  const mapTable = await A.get(`/api/leagues/standings?leagueId=${leagueId}&week=9`);
  const mapRow = mapTable.json.playerScores.find((s) => s.ign === mapPlayer.ign);
  ok(mapRow && mapRow.points === 64 && mapRow.breakdown?.stats?.eliminations === 30 && mapRow.breakdown?.series === 1,
    `per-map lines aggregate to one series line before scoring (${mapPlayer.ign}: ${mapRow?.points} pts, want 64)`,
    JSON.stringify(mapRow || {}).slice(0, 200));

  console.log(`\nLOOP TEST PASSED - ${step} checks. signup → league → draft → lineups → import → scoring → playoffs → champion, all over HTTP.`);
  cleanup(0);
} catch (err) {
  console.error("\nLOOP TEST ERRORED:", err);
  console.error("--- server log ---\n" + serverLog.slice(-3000));
  cleanup(1);
}
