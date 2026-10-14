/* league.js, the league room: overview, draft, lineup, standings, commish. */
import { renderChrome, api, esc, fmtDate } from "/assets/js/site.js";

renderChrome("");
const params = new URLSearchParams(location.search);
const leagueId = params.get("id");
const alertBox = document.querySelector("[data-alert]");
const showError = (m) => { alertBox.textContent = m; alertBox.classList.add("show"); };
if (!leagueId) { showError("No league specified."); throw new Error("no league"); }

let L = null; // league/get payload
let draftTimer = null;

const statusText = {
  forming: "Forming, waiting for teams",
  drafting: "Draft in progress",
  active: "Season running",
  playoffs: "Playoffs",
  complete: "Season complete",
};

async function loadLeague() {
  L = await api(`/api/leagues/get?id=${leagueId}`);
  const { league, season, members, me, events, myRoster, isCommissioner } = L;
  document.title = `${league.name} · Rivals Fantasy`;
  document.querySelector("[data-league-name]").textContent = league.name;
  document.querySelector("[data-season-line]").textContent =
    `${season ? season.name : ""}${season?.stage ? " · " + season.stage : ""}`;
  document.querySelector("[data-league-sub]").textContent =
    `${statusText[league.status] || league.status} · ${members.length}/${league.size} teams · your team: ${me.team_name}`;
  if (isCommissioner) document.querySelector("[data-comm-tab]").classList.remove("hidden");

  document.querySelector("[data-members]").innerHTML = members.map((m) => `
    <div class="pick-row"><strong>${esc(m.team_name)}</strong>
      <span class="muted small">${esc(m.display_name)}${m.user_id === league.commissioner_id ? " · commissioner" : ""}${m.id === me.id ? " · you" : ""}</span>
    </div>`).join("");

  const next = document.querySelector("[data-next-step]");
  if (league.status === "forming") {
    next.textContent = members.length < 2
      ? "Invite at least one more team, then the commissioner can start the draft."
      : isCommissioner
        ? "You have enough teams. Start the draft from the Draft tab whenever your league is ready, the pick clock and auto-picks handle the rest."
        : "Your league has enough teams. The commissioner starts the draft when everyone's in.";
  } else if (league.status === "drafting") {
    next.textContent = "The draft is live, head to the Draft tab. Picks auto-advance when the clock runs out.";
  } else if (league.status === "active") {
    next.textContent = "Season running. Set your lineup in My Team before each week's first match locks it, and follow the table in Standings & Matchups.";
  } else if (league.status === "playoffs") {
    next.textContent = "Playoffs. The bracket is in Standings & Matchups, semifinal winners meet in the final.";
  } else {
    next.textContent = "This season is complete. Final table stands in Standings & Matchups.";
  }

  document.querySelector("[data-feed]").innerHTML = events.length
    ? events.map((e) => `<div class="feed-item">${describeEvent(e)}<div class="when">${fmtDate(e.created_at)} ${new Date(e.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div></div>`).join("")
    : `<p class="muted small">Nothing yet.</p>`;

  const inviteFromCreate = params.get("invite");
  if (inviteFromCreate) setInvite(inviteFromCreate);
  renderMyRoster(myRoster);
}

function describeEvent(e) {
  const p = e.payload || {};
  const memberName = (id) => (L.members.find((m) => m.id === id)?.team_name) || "A team";
  switch (e.type) {
    case "league_created": return `League created for ${esc(p.competition || "its competition")}.`;
    case "member_joined": return `${esc(p.teamName || "A team")} joined the league.`;
    case "draft_started": return `The draft started.`;
    case "draft_pick": return `${memberName(p.member)} drafted ${esc(p.player || p.squad || "")}.`;
    case "draft_auto_pick": return `${memberName(p.member)} auto-picked ${esc(p.player || p.squad || "")} (clock expired).`;
    case "draft_complete": return `Draft complete, the season schedule is set.`;
    case "week_scored": return `Week ${p.week} was scored.`;
    case "playoffs_generated": return `Playoff bracket seeded for week ${p.week}.`;
    default: return esc(e.type.replaceAll("_", " "));
  }
}

function setInvite(code) {
  document.querySelector("[data-invite-code]").textContent = code;
  document.querySelector("[data-copy-link]").dataset.link =
    `${location.origin}/join.html?code=${code}`;
}
document.querySelector("[data-new-invite]").addEventListener("click", async () => {
  const { code } = await api("/api/leagues/invite", { method: "POST", body: JSON.stringify({ leagueId }) });
  setInvite(code);
});
document.querySelector("[data-copy-link]").addEventListener("click", async (e) => {
  const link = e.target.dataset.link;
  if (link) await navigator.clipboard.writeText(link).catch(() => {});
  e.target.textContent = "Copied";
  setTimeout(() => (e.target.textContent = "Copy invite link"), 1500);
});

/* --- tabs --- */
document.querySelector("[data-tabs]").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tab]");
  if (!btn) return;
  document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b === btn));
  document.querySelectorAll("[data-pane]").forEach((p) =>
    p.classList.toggle("hidden", p.dataset.pane !== btn.dataset.tab));
  if (btn.dataset.tab === "draft") loadDraft();
  if (btn.dataset.tab === "standings") loadStandings();
  if (btn.dataset.tab === "team") loadLineup();
});

/* --- draft --- */
let poolCache = [];
async function loadDraft() {
  try {
    const state = await api(`/api/leagues/draft?leagueId=${leagueId}`);
    renderDraft(state);
    clearInterval(draftTimer);
    if (state.draft?.status === "live") {
      draftTimer = setInterval(loadDraft, 4000);
    }
  } catch (err) { showError(err.message); }
}

function renderDraft(state) {
  const { draft, picks, pool, squads, myMemberId } = state;
  poolCache = pool || [];
  const title = document.querySelector("[data-draft-title]");
  const status = document.querySelector("[data-draft-status]");
  const actions = document.querySelector("[data-draft-actions]");
  const poolEl = document.querySelector("[data-pool]");
  const clockEl = document.querySelector("[data-draft-clock]");
  const memberName = (id) => (L.members.find((m) => m.id === id)?.team_name) || "·";

  document.querySelector("[data-picks]").innerHTML = picks?.length
    ? [...picks].reverse().map((p) => `
      <div class="pick-row"><span class="mono fine">#${p.pick_no + 1}</span>
        <strong>${esc(p.ign || p.squad_name || "")}</strong>
        <span class="muted small">${esc(p.role || (p.squad_name ? "Squad" : ""))}</span>
        <span class="spacer"></span><span class="small">${esc(p.team_name)}</span>${p.auto ? ' <span class="fine">auto</span>' : ""}</div>`).join("")
    : `<p class="muted small">No picks yet.</p>`;

  if (!draft) {
    title.textContent = "Draft room";
    status.textContent = L.league.status === "forming"
      ? "The draft hasn't started. Once every team is in, the commissioner starts it here, order is drawn at random, snake format."
      : "No draft for this league.";
    actions.innerHTML = L.isCommissioner && L.league.status === "forming"
      ? `<button class="btn btn-accent" data-start-draft>Start the draft</button>` : "";
    poolEl.innerHTML = "";
    clockEl.textContent = "";
    bindStart();
    return;
  }
  if (draft.status === "complete") {
    title.textContent = "Draft complete";
    status.textContent = `${draft.totalPicks} picks made. Rosters are set, the schedule is in Standings & Matchups.`;
    actions.innerHTML = "";
    poolEl.innerHTML = "";
    clockEl.textContent = "";
    return;
  }
  const mine = draft.onClock?.memberId === myMemberId;
  title.textContent = draft.onClockPickKind === "squad" ? "Squad round" : `Round ${Math.floor(draft.currentPick / draft.order.length) + 1}`;
  status.innerHTML = mine
    ? `<strong>You're on the clock.</strong> Pick ${draft.currentPick + 1} of ${draft.totalPicks}${draft.onClockPickKind === "squad" ? ", claim your pro org." : ""}`
    : `Pick ${draft.currentPick + 1} of ${draft.totalPicks}, ${esc(memberName(draft.onClock?.memberId))} is on the clock.`;
  actions.innerHTML = L.isCommissioner
    ? `<span class="fine">As commissioner you can also let the clock run, expired picks auto-pick the best available.</span>` : "";
  clockEl.textContent = draft.pickDeadline ? countdown(draft.pickDeadline) : "";

  if (draft.onClockPickKind === "squad") {
    poolEl.innerHTML = (squads || []).map((s) => `
      <div class="pool-row"><strong>${esc(s.name)}</strong><span class="role">${esc(s.region || "")}</span>
      <span class="spacer"></span>
      ${mine ? `<button class="btn btn-small btn-accent" data-pick-squad="${s.id}">Claim squad</button>` : ""}</div>`).join("");
  } else {
    poolEl.innerHTML = poolCache.map((p) => `
      <div class="pool-row"><span class="mono fine" style="width:30px">${p.draft_rank}</span>
      <strong>${esc(p.ign)}</strong>
      <span class="role ${p.role === "Vanguard" ? "van" : p.role === "Duelist" ? "due" : "str"}">${esc(p.role)}</span>
      <span class="muted small">${esc(p.pro_team_name || "")}</span>
      <span class="spacer"></span>
      ${mine ? `<button class="btn btn-small btn-accent" data-pick-player="${p.id}">Draft</button>` : ""}</div>`).join("");
  }
  poolEl.querySelectorAll("[data-pick-player]").forEach((b) =>
    b.addEventListener("click", () => doPick({ playerId: b.dataset.pickPlayer })));
  poolEl.querySelectorAll("[data-pick-squad]").forEach((b) =>
    b.addEventListener("click", () => doPick({ proTeamId: b.dataset.pickSquad })));
}

function countdown(deadline) {
  const left = Math.max(0, Math.round((Date.parse(deadline) - Date.now()) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}
setInterval(() => {
  const el = document.querySelector("[data-draft-clock]");
  // Clock text refreshes on the 4s draft poll; this keeps the display honest between polls.
  if (el && el.textContent && !el.textContent.includes(":")) el.textContent = "";
}, 1000);

function bindStart() {
  document.querySelector("[data-start-draft]")?.addEventListener("click", async () => {
    try {
      await api("/api/leagues/draft", { method: "POST", body: JSON.stringify({ leagueId, action: "start" }) });
      await loadLeague();
      loadDraft();
    } catch (err) { showError(err.message); }
  });
}
async function doPick(body) {
  try {
    await api("/api/leagues/draft", { method: "POST", body: JSON.stringify({ leagueId, action: "pick", ...body }) });
    loadDraft();
  } catch (err) { showError(err.message); loadDraft(); }
}

/* --- my team / lineup --- */
let lineupState = { roster: [], week: 1 };
function renderMyRoster(roster) {
  lineupState.roster = roster;
}
async function loadLineup() {
  const weekSel = document.querySelector("[data-week-select]");
  if (!weekSel.options.length) {
    const weeks = (L.league.settings?.regularWeeks || 5) + 2;
    for (let w = 1; w <= weeks; w++) weekSel.add(new Option(`Week ${w}`, w));
    weekSel.value = "1";
  }
  const week = Number(weekSel.value) || 1;
  lineupState.week = week;
  try {
    const data = await api(`/api/leagues/lineup?leagueId=${leagueId}&week=${week}`);
    const saved = Object.fromEntries((data.lineup || []).map((l) => [l.player_id, l.slot]));
    const lockNote = document.querySelector("[data-lock-note]");
    lockNote.textContent = data.locked
      ? `Week ${week} is locked (first match: ${fmtDate(data.locksAt)}).`
      : data.locksAt
        ? `Week ${week} locks at the first match (${fmtDate(data.locksAt)}).`
        : `Week ${week} has no scheduled matches yet, the lineup saves now and applies when fixtures land.`;
    document.querySelector("[data-save-lineup]").disabled = data.locked;
    const players = data.roster.filter((r) => r.player_id);
    const squad = data.roster.find((r) => r.pro_team_id);
    document.querySelector("[data-lineup-rows]").innerHTML = players.map((r) => `
      <tr><td><strong>${esc(r.ign)}</strong></td>
        <td><span class="role ${r.role === "Vanguard" ? "van" : r.role === "Duelist" ? "due" : "str"}">${esc(r.role)}</span></td>
        <td class="muted">${esc(r.pro_team_name || "")}</td>
        <td><select data-slot-for="${r.player_id}" ${data.locked ? "disabled" : ""} style="padding:7px 10px; border:1px solid var(--line-dark); border-radius:8px; font:inherit; width:100%">
          ${["VAN", "DUE", "STR", "FLEX", "BENCH"].map((s) => `<option value="${s}" ${saved[r.player_id] === s ? "selected" : ""}>${s === "BENCH" ? "Bench" : s}</option>`).join("")}
        </select></td></tr>`).join("") +
      (squad ? `<tr><td><strong>${esc(squad.squad_name)}</strong></td><td><span class="role">Squad</span></td><td class="muted">scores its own series</td><td class="muted small">Always on</td></tr>` : "");
    // Default unassigned players to BENCH in the UI (validator requires full assignment of starters only;
    // unselected roster players default to bench server-side by omission).
    document.querySelectorAll("[data-slot-for]").forEach((sel) => {
      if (!saved[sel.dataset.slotFor]) sel.value = "BENCH";
    });
  } catch (err) { showError(err.message); }
}
document.querySelector("[data-week-select]")?.addEventListener("change", loadLineup);
document.querySelector("[data-save-lineup]")?.addEventListener("click", async () => {
  const assignments = [...document.querySelectorAll("[data-slot-for]")]
    .map((sel) => ({ playerId: sel.dataset.slotFor, slot: sel.value }));
  const info = document.querySelector("[data-team-info]");
  const errBox = document.querySelector("[data-team-alert]");
  errBox.classList.remove("show"); info.classList.remove("show");
  try {
    await api("/api/leagues/lineup", {
      method: "POST",
      body: JSON.stringify({ leagueId, week: lineupState.week, assignments }),
    });
    info.textContent = `Lineup saved for week ${lineupState.week}.`;
    info.classList.add("show");
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.add("show");
  }
});

/* --- standings --- */
async function loadStandings() {
  try {
    const detailSel = document.querySelector("[data-detail-week]");
    if (!detailSel.options.length) {
      const weeks = (L.league.settings?.regularWeeks || 5) + 2;
      for (let w = 1; w <= weeks; w++) detailSel.add(new Option(`Week ${w}`, w));
    }
    const data = await api(`/api/leagues/standings?leagueId=${leagueId}&week=${detailSel.value || 1}`);
    document.querySelector("[data-standings-rows]").innerHTML = data.standings.length
      ? data.standings.map((s) => `
        <tr class="${s.member_id === L.me.id ? "me" : ""}"><td>${esc(s.team_name)}</td>
          <td class="n">${s.wins}</td><td class="n">${s.losses}</td>
          <td class="n">${Number(s.points_for).toFixed(1)}</td><td class="n">${Number(s.points_against).toFixed(1)}</td></tr>`).join("")
      : `<tr><td colspan="5" class="muted">No table yet, the draft comes first.</td></tr>`;
    const byWeek = {};
    for (const m of data.matchups) (byWeek[m.week] ||= []).push(m);
    document.querySelector("[data-matchups]").innerHTML = Object.keys(byWeek).length
      ? Object.entries(byWeek).map(([w, ms]) => `
        <p class="kicker" style="margin:12px 0 6px">${ms[0].is_playoff ? "Playoff · " : ""}Week ${w}</p>
        ${ms.map((m) => `<div class="pick-row"><span>${esc(m.team_a)}${m.team_b ? " vs " + esc(m.team_b) : " · bye"}</span><span class="spacer"></span>
          <span class="mono">${m.score_a == null ? "·" : `${Number(m.score_a).toFixed(1)} : ${m.score_b == null ? "·" : Number(m.score_b).toFixed(1)}`}</span></div>`).join("")}`).join("")
      : `<p class="muted small">Matchups generate when the draft completes.</p>`;
    const detail = document.querySelector("[data-week-detail]");
    const rows = data.playerScores.map((s) => `
      <div class="pick-row"><strong>${esc(s.ign)}</strong><span class="role ${s.role === "Vanguard" ? "van" : s.role === "Duelist" ? "due" : "str"}">${esc(s.role)}</span>
      <span class="muted small">${esc(s.team_name)} · ${s.breakdown?.series ?? 0} series, ${s.breakdown?.seriesWon ?? 0} won</span>
      <span class="spacer"></span><span class="mono">${Number(s.points).toFixed(1)}</span></div>`).join("");
    const squads = data.squadScores.map((s) => `
      <div class="pick-row"><strong>${esc(s.squad_name)}</strong><span class="role">Squad</span>
      <span class="muted small">${esc(s.team_name)} · ${s.breakdown?.seriesWins ?? 0} series wins, ${s.breakdown?.sweeps ?? 0} sweeps</span>
      <span class="spacer"></span><span class="mono">${Number(s.points).toFixed(1)}</span></div>`).join("");
    detail.innerHTML = rows || squads
      ? rows + squads
      : `<p class="muted small" style="padding-top:10px">Week ${data.week} hasn't been scored yet.</p>`;
  } catch (err) { showError(err.message); }
}
document.querySelector("[data-detail-week]")?.addEventListener("change", loadStandings);

/* --- commissioner --- */
document.querySelector("[data-score-week]")?.addEventListener("click", async () => {
  const week = Number(document.querySelector("[data-score-week-input]").value) || 1;
  const gen = document.querySelector("[data-gen-playoffs]").checked;
  const info = document.querySelector("[data-comm-info]");
  try {
    const r = await api("/api/leagues/score-week", {
      method: "POST",
      body: JSON.stringify({ leagueId, week, generatePlayoffs: gen }),
    });
    info.textContent = `Week ${week} scored across ${r.matchups} matchups.${r.playoffs ? " Playoff bracket seeded." : ""}`;
    info.classList.add("show");
    await loadLeague();
  } catch (err) {
    info.textContent = err.message;
    info.classList.add("show");
  }
});

try {
  await loadLeague();
  // If the draft is already live, land the user near it.
  if (L.league.status === "drafting") loadDraft();
} catch (err) {
  if (err.status === 401) location.href = "/login.html";
  else showError(err.message);
}
