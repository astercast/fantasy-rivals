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

/* --- draft: the room (FANTASY-STUDY 5.3, from the Sleeper draft-room
   teardown, study section 1). Board above, pool bottom left, rail right
   with the queue as its default face. On the clock, exactly one board
   cell is loud and it carries the countdown inside itself. --- */
let poolCache = [];
let lastState = null;
let poolRole = "";
let poolQuery = "";
let showDrafted = false;
let autoPick = false;
let autoFiredFor = -1;
let queue = loadQueue();

const roleClass = (r) => r === "Vanguard" ? "van" : r === "Duelist" ? "due" : "str";
const memberName = (id) => (L?.members.find((m) => m.id === id)?.team_name) || "·";

function loadQueue() {
  try { return JSON.parse(localStorage.getItem(`rf-queue-${leagueId}`) || "[]"); } catch { return []; }
}
function saveQueue() {
  try { localStorage.setItem(`rf-queue-${leagueId}`, JSON.stringify(queue)); } catch {}
}

async function loadDraft() {
  try {
    const state = await api(`/api/leagues/draft?leagueId=${leagueId}`);
    lastState = state;
    renderDraft(state);
    clearInterval(draftTimer);
    if (state.draft?.status === "live") {
      draftTimer = setInterval(loadDraft, 4000);
    }
  } catch (err) { showError(err.message); }
}

/* The countdown lives in the on-the-clock cell and ticks every second
   against the server deadline; the 4s poll only re-reads the room. */
setInterval(() => {
  const el = document.querySelector("[data-cell-clock]");
  if (el && lastState?.draft?.pickDeadline) el.textContent = countdown(lastState.draft.pickDeadline);
}, 1000);

function renderDraft(state) {
  const { draft, picks, pool, myMemberId } = state;
  poolCache = pool || [];
  const title = document.querySelector("[data-draft-title]");
  const status = document.querySelector("[data-draft-status]");
  const actions = document.querySelector("[data-draft-actions]");

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
    document.querySelector("[data-board]").innerHTML = "";
    document.querySelector("[data-pool]").innerHTML = "";
    document.querySelector("[data-pool-tabs]").innerHTML = "";
    document.querySelector("[data-pool-filter-line]").textContent = "";
    bindStart();
    renderQueue(state);
    renderRoster(state);
    return;
  }
  if (draft.status === "complete") {
    title.textContent = "Draft complete";
    status.textContent = `${draft.totalPicks} picks made. Rosters are set, the schedule is in Standings & Matchups.`;
    actions.innerHTML = "";
    renderBoard(state);
    document.querySelector("[data-pool]").innerHTML = "";
    document.querySelector("[data-pool-tabs]").innerHTML = "";
    document.querySelector("[data-pool-filter-line]").textContent = "";
    renderQueue(state);
    renderRoster(state);
    return;
  }
  const mine = draft.onClock?.memberId === myMemberId;
  title.textContent = draft.onClockPickKind === "squad" ? "Squad round" : `Round ${Math.floor(draft.currentPick / draft.order.length) + 1}`;
  status.innerHTML = mine
    ? `<strong>You're on the clock.</strong> Pick ${draft.currentPick + 1} of ${draft.totalPicks}${draft.onClockPickKind === "squad" ? ", claim your pro org." : ""}`
    : `Pick ${draft.currentPick + 1} of ${draft.totalPicks}, ${esc(memberName(draft.onClock?.memberId))} is on the clock.`;
  actions.innerHTML = L.isCommissioner
    ? `<span class="fine">As commissioner you can also let the clock run, expired picks auto-pick the best available.</span>` : "";
  renderBoard(state);
  renderPool(state);
  renderQueue(state);
  renderRoster(state);

  /* Auto-pick, armed by hand in the rail: when your turn arrives, the
     top of your queue is drafted through the same pick call a tap
     makes. Announced in exactly two places, both furniture: the rail
     toggle's own word, and the AUTO tag on your board cell. */
  if (mine && autoPick && draft.onClockPickKind !== "squad" && autoFiredFor !== draft.currentPick) {
    const available = new Set(poolCache.map((p) => p.id));
    const top = queue.find((id) => available.has(id));
    if (top) {
      autoFiredFor = draft.currentPick;
      doPick({ playerId: top });
    }
  }
}

function renderBoard(state) {
  const { draft, picks, myMemberId } = state;
  const el = document.querySelector("[data-board]");
  if (!draft?.order?.length) { el.innerHTML = ""; return; }
  const n = draft.order.length;
  const byPick = Object.fromEntries((picks || []).map((p) => [p.pick_no, p]));
  const head = draft.order.map((mid) =>
    `<th>${esc(memberName(mid))}${mid === myMemberId ? ' <span class="b-meta">you</span>' : ""}</th>`).join("");
  let rows = "";
  for (let r = 1; r <= draft.rounds; r++) {
    let cells = "";
    for (let c = 0; c < n; c++) {
      const pickNo = (r - 1) * n + (r % 2 === 1 ? c : n - 1 - c);
      const p = byPick[pickNo];
      const isClock = draft.status === "live" && pickNo === draft.currentPick;
      const memberId = draft.order[c];
      if (isClock) {
        cells += `<td class="on-clock"><span class="b-ign">${esc(memberName(memberId))}</span>` +
          `<span class="b-clock" data-cell-clock>${draft.pickDeadline ? countdown(draft.pickDeadline) : ""}</span>` +
          `<span class="b-meta">Pick ${pickNo + 1} of ${draft.totalPicks} · on the clock</span>` +
          `${memberId === myMemberId && autoPick ? ' <span class="b-auto">AUTO</span>' : ""}</td>`;
      } else if (p) {
        cells += `<td class="${p.member_id === myMemberId ? "mine" : ""}"><span class="b-ign">${esc(p.ign || p.squad_name || "")}</span>` +
          `<span class="b-meta">${esc(p.role || (p.squad_name ? "Squad" : ""))}${p.auto ? " · auto" : ""}</span></td>`;
      } else {
        cells += `<td class="empty">Pick ${pickNo + 1}</td>`;
      }
    }
    rows += `<tr><td class="rd">${r}</td>${cells}</tr>`;
  }
  el.innerHTML = `<table class="board"><thead><tr><th class="rd">Rd</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPool(state) {
  const { draft, picks, squads, myMemberId } = state;
  const poolEl = document.querySelector("[data-pool]");
  const tabsEl = document.querySelector("[data-pool-tabs]");
  const lineEl = document.querySelector("[data-pool-filter-line]");
  const mine = draft.onClock?.memberId === myMemberId;

  if (draft.onClockPickKind === "squad") {
    tabsEl.innerHTML = "";
    lineEl.textContent = `Squad round: ${squads?.length || 0} pro orgs unclaimed. Claim yours, it scores its own series all season.`;
    poolEl.innerHTML = (squads || []).map((s) => `
      <div class="pool2-row">
        ${mine ? `<button class="pick-ctl live" data-pick-squad="${s.id}" title="Claim ${esc(s.name)}" aria-label="Claim ${esc(s.name)}">+</button>` : `<span class="pick-ctl" aria-hidden="true">+</span>`}
        <span class="who">${esc(s.name)}</span>
        <span class="role">${esc(s.region || "")}</span>
        <span class="marg">${esc(s.short || "")}</span>
      </div>`).join("");
    poolEl.querySelectorAll("[data-pick-squad]").forEach((b) =>
      b.addEventListener("click", () => doPick({ proTeamId: b.dataset.pickSquad })));
    return;
  }

  /* Filter tabs carry the roster-fill fraction under each label (study
     1.3): how many of that role your roster already holds, of the one
     starter the lineup needs. */
  const myPicks = (picks || []).filter((p) => p.member_id === myMemberId && p.player_id);
  const fill = (role) => myPicks.filter((p) => p.role === role).length;
  const tabDefs = [
    { role: "", label: "All", frac: `${poolCache.length} available` },
    { role: "Vanguard", label: "Vanguard", frac: `${fill("Vanguard")}/1 drafted` },
    { role: "Duelist", label: "Duelist", frac: `${fill("Duelist")}/1 drafted` },
    { role: "Strategist", label: "Strategist", frac: `${fill("Strategist")}/1 drafted` },
  ];
  tabsEl.innerHTML = tabDefs.map((t) =>
    `<button data-pool-role="${esc(t.role)}" class="${t.role === poolRole ? "active" : ""}" aria-pressed="${t.role === poolRole}">${t.label}<span class="frac">${t.frac}</span></button>`).join("");
  tabsEl.querySelectorAll("[data-pool-role]").forEach((b) =>
    b.addEventListener("click", () => { poolRole = b.dataset.poolRole; renderPool(state); }));

  const draftedById = Object.fromEntries((picks || []).filter((p) => p.player_id).map((p) => [p.player_id, p]));
  const q = poolQuery.trim().toLowerCase();
  const available = poolCache.filter((p) =>
    (!poolRole || p.role === poolRole) && (!q || p.ign.toLowerCase().includes(q)));
  const draftedShown = showDrafted
    ? Object.values(draftedById)
        .filter((p) => (!poolRole || p.role === poolRole) && (!q || (p.ign || "").toLowerCase().includes(q)))
        .sort((a, b) => a.pick_no - b.pick_no)
    : [];
  const parts = [`Showing ${available.length + draftedShown.length} of ${poolCache.length + Object.keys(draftedById).length}`];
  if (poolRole) parts.push(`role: ${poolRole}`);
  if (q) parts.push(`search: "${poolQuery.trim()}"`);
  if (showDrafted) parts.push("drafted shown");
  lineEl.textContent = parts.join(" · ");

  const queued = new Set(queue);
  const rowsHtml = available.map((p) => `
    <div class="pool2-row">
      ${mine ? `<button class="pick-ctl live" data-pick-player="${p.id}" title="Draft ${esc(p.ign)}" aria-label="Draft ${esc(p.ign)}">+</button>` : `<span class="pick-ctl" aria-hidden="true">+</span>`}
      <span class="rk">${p.draft_rank}</span>
      <span class="who">${esc(p.ign)}</span>
      <span class="role ${roleClass(p.role)}">${esc(p.role)}</span>
      <span class="muted small">${esc(p.pro_team_name || "")}</span>
      <span class="marg">${(p.heroes || []).map(esc).join(" · ")}</span>
      <button class="queue-ctl${queued.has(p.id) ? " queued" : ""}" data-queue-toggle="${p.id}" aria-pressed="${queued.has(p.id)}">${queued.has(p.id) ? "Queued" : "Queue"}</button>
    </div>`).join("") + draftedShown.map((p) => `
    <div class="pool2-row drafted">
      <span class="rk">·</span>
      <span class="who">${esc(p.ign || "")}</span>
      <span class="role ${roleClass(p.role)}">${esc(p.role || "")}</span>
      <span class="marg">Drafted · pick ${p.pick_no + 1} · ${esc(p.team_name)}</span>
    </div>`).join("");
  poolEl.innerHTML = rowsHtml || `<p class="muted small" style="padding:10px 2px">No players match that filter line.</p>`;
  poolEl.querySelectorAll("[data-pick-player]").forEach((b) =>
    b.addEventListener("click", () => doPick({ playerId: b.dataset.pickPlayer })));
  poolEl.querySelectorAll("[data-queue-toggle]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.queueToggle;
      queue = queue.includes(id) ? queue.filter((x) => x !== id) : [...queue, id];
      saveQueue();
      renderPool(state);
      renderQueue(state);
    }));
}

/* The queue: insertion-ordered, never sorted by the room. The top row
   wears the surface's only dashed border and the words NEXT PICK.
   Drafted players leave the queue on their own. */
function renderQueue(state) {
  const el = document.querySelector("[data-queue]");
  if (!el) return;
  const { draft, myMemberId } = state;
  const byId = Object.fromEntries(poolCache.map((p) => [p.id, p]));
  const pruned = queue.filter((id) => byId[id]);
  if (pruned.length !== queue.length) { queue = pruned; saveQueue(); }
  if (!queue.length) {
    el.innerHTML = `<p class="muted small" style="padding:8px 2px">Your queue is empty. Add players from the pool; the order you build here is the order the room respects, it never sorts itself.</p>`;
    return;
  }
  const mine = draft?.status === "live" && draft.onClock?.memberId === myMemberId && draft.onClockPickKind !== "squad";
  const controls = (p) => `
    <span class="q-marg">RK ${p.draft_rank} · ${esc(p.role)}</span>
    ${mine ? `<button class="btn btn-small btn-accent" data-queue-draft="${p.id}">Draft</button>` : ""}
    <button class="q-remove" data-queue-remove="${p.id}">Remove</button>`;
  el.innerHTML = queue.map((id, i) => {
    const p = byId[id];
    if (i === 0) {
      return `<div class="queue-row next-pick" draggable="true" data-queue-row="0">
        <div style="flex:1; min-width:0">
          <span class="next-pick-tag">Next pick</span>
          <div style="display:flex; gap:9px; align-items:center; flex-wrap:wrap">
            <span class="drag" aria-hidden="true">⠿</span>
            <span class="q-name">${esc(p.ign)}</span>
            ${controls(p)}
          </div>
        </div>
      </div>`;
    }
    return `<div class="queue-row" draggable="true" data-queue-row="${i}">
      <span class="drag" aria-hidden="true">⠿</span>
      <span class="q-name">${esc(p.ign)}</span>
      ${controls(p)}
    </div>`;
  }).join("");
  el.querySelectorAll("[data-queue-remove]").forEach((b) =>
    b.addEventListener("click", () => {
      queue = queue.filter((x) => x !== b.dataset.queueRemove);
      saveQueue();
      renderQueue(state);
      if (lastState) renderPool(lastState);
    }));
  el.querySelectorAll("[data-queue-draft]").forEach((b) =>
    b.addEventListener("click", () => doPick({ playerId: b.dataset.queueDraft })));
  let dragIdx = null;
  el.querySelectorAll("[data-queue-row]").forEach((rowEl) => {
    rowEl.addEventListener("dragstart", () => { dragIdx = Number(rowEl.dataset.queueRow); });
    rowEl.addEventListener("dragover", (e) => e.preventDefault());
    rowEl.addEventListener("drop", (e) => {
      e.preventDefault();
      const target = Number(rowEl.dataset.queueRow);
      if (dragIdx == null || dragIdx === target) return;
      const [moved] = queue.splice(dragIdx, 1);
      queue.splice(target, 0, moved);
      dragIdx = null;
      saveQueue();
      renderQueue(state);
    });
  });
}

function renderRoster(state) {
  const el = document.querySelector("[data-rail-roster]");
  if (!el) return;
  const mine = (state.picks || []).filter((p) => p.member_id === state.myMemberId);
  el.innerHTML = mine.length
    ? mine.map((p) => `
      <div class="pick-row"><strong>${esc(p.ign || p.squad_name || "")}</strong>
        <span class="muted small">${esc(p.role || (p.squad_name ? "Squad" : ""))}</span>
        <span class="spacer"></span><span class="mono fine">Pick ${p.pick_no + 1}</span></div>`).join("")
    : `<p class="muted small" style="padding:8px 2px">Nothing drafted yet. Your roster fills in here as your picks land.</p>`;
}

/* Rail faces and pool furniture, bound once. */
document.querySelector("[data-rail-tabs]")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-rail]");
  if (!btn) return;
  document.querySelectorAll("[data-rail]").forEach((b) => b.classList.toggle("active", b === btn));
  document.querySelector("[data-rail-queue]").classList.toggle("hidden", btn.dataset.rail !== "queue");
  document.querySelector("[data-rail-roster]").classList.toggle("hidden", btn.dataset.rail !== "roster");
  document.querySelector("[data-rail-picks]").classList.toggle("hidden", btn.dataset.rail !== "picks");
});
document.querySelector("[data-pool-search]")?.addEventListener("input", (e) => {
  poolQuery = e.target.value;
  if (lastState) renderPool(lastState);
});
document.querySelector("[data-show-drafted]")?.addEventListener("click", (e) => {
  showDrafted = !showDrafted;
  e.target.setAttribute("aria-pressed", String(showDrafted));
  e.target.textContent = showDrafted ? "Show drafted: on" : "Show drafted";
  if (lastState) renderPool(lastState);
});
document.querySelector("[data-auto-pick]")?.addEventListener("click", (e) => {
  autoPick = !autoPick;
  autoFiredFor = -1;
  e.target.setAttribute("aria-pressed", String(autoPick));
  e.target.textContent = autoPick ? "Auto-pick: armed" : "Auto-pick: off";
  if (lastState) renderDraft(lastState);
});

function countdown(deadline) {
  const left = Math.max(0, Math.round((Date.parse(deadline) - Date.now()) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

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
        <p class="kicker" style="margin:14px 0 6px">${ms[0].is_playoff ? "Playoff · " : ""}Week ${w}</p>
        ${ms.map((m) => {
          const played = m.score_a != null && m.score_b != null;
          const aWin = played && Number(m.score_a) > Number(m.score_b);
          const bWin = played && Number(m.score_b) > Number(m.score_a);
          return `<div class="versus">
            <div class="side ${aWin ? "win" : ""}"><span class="t-name">${esc(m.team_a)}</span><span class="t-score">${m.score_a == null ? "·" : Number(m.score_a).toFixed(1)}</span></div>
            <div class="vs-mid"><span class="vs-badge">${m.team_b ? "VS" : "BYE"}</span></div>
            <div class="side right ${bWin ? "win" : ""}"><span class="t-name">${m.team_b ? esc(m.team_b) : "Bye week"}</span><span class="t-score">${m.score_b == null ? "·" : Number(m.score_b).toFixed(1)}</span></div>
          </div>`;
        }).join("")}`).join("")
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
