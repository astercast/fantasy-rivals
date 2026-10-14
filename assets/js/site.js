/* site.js, shared chrome (the trade dress), the season plate, and small
   public-data helpers. Loaded on every page.

   Trade dress (FANTASY-STUDY section 5.4, from the Marvel Comics cover
   system teardown, study section 4): a fixed band on every page (wordmark
   left, competition switcher right, display face, one size), a corner box
   at the band's right end carrying season state in dual-number form, and
   a foot reduced to one small-print line (provenance + update time). The
   dress itself is flat; halftone lives only in the splash beat and in the
   plate's state-change moment. */

export const GAME_SLUG = "marvel-rivals";

export async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    const err = new Error(body?.error?.message || `Request failed (${res.status})`);
    err.code = body?.error?.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

export function fmtDate(iso) {
  if (!iso) return "·";
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00Z" : iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* The public season file is fetched once per page and shared by the
   corner box, the plate, and the foot line, so the dress can never
   disagree with itself. State inside it is calendar-derived at build
   time in scripts/build-site.mjs; the league picker derives the same
   state at request time in api/leagues/meta.js. Same rule, both sites. */
let seasonPromise = null;
export function seasonData() {
  if (!seasonPromise) {
    seasonPromise = fetchJson(`/data/v1/${GAME_SLUG}-season.json`).catch(() => null);
  }
  return seasonPromise;
}

/* Dual-number season state for the corner box (study 5.4): the current
   run's number over the season's whole. Today that reads as the stage
   word (PLAYOFFS) over the live competition's position in the season
   (3 OF 4). Derived from the season file only; nothing is authored here. */
export function cornerBoxState(data) {
  if (!data) return { top: "SEASON", bottom: "STATE UNAVAILABLE" };
  const seasons = [...(data.seasons || [])].sort((a, b) =>
    (a.startsOn || "").localeCompare(b.startsOn || ""));
  const total = seasons.length;
  const live = data.liveNow?.[0];
  if (live) {
    const pos = seasons.findIndex((s) => s.name === live.name) + 1;
    const stageWord = (live.stage || "").trim().split(/\s+/)[0] || "LIVE";
    const shortName = (live.name.split(":").pop() || "").trim().toUpperCase();
    return {
      top: shortName || "LIVE NOW",
      bottom: `${stageWord.toUpperCase()} · ${pos} OF ${total}`,
    };
  }
  const next = data.nextUp;
  if (next) {
    const pos = seasons.findIndex((s) => s.name === next.name) + 1;
    const shortName = (next.name.split(":").pop() || "").trim().toUpperCase();
    return { top: shortName || "NEXT UP", bottom: `NEXT · ${pos} OF ${total}` };
  }
  return { top: "OFF SEASON", bottom: `${total} EVENTS FILED`, loud: false };
}

/* The plate's one loud state (study 5.2): the state word takes corner-box
   red only when the season state changes class, the playoffs of the live
   competition or the Grand Finals window. Every other day it sits in ink. */
export function isLoudState(live) {
  if (!live) return false;
  return /playoff/i.test(live.stage || "") || /grand finals/i.test(live.name || "");
}

export function renderChrome(active) {
  const head = document.querySelector("[data-chrome-head]");
  if (head) {
    head.innerHTML = `
      <div class="wrap band">
        <a class="wordmark" href="/">Rivals<span class="dot">·</span>Fantasy</a>
        <nav class="main-nav">
          <a href="/season.html" ${active === "season" ? 'aria-current="page"' : ""}>Season</a>
          <a href="/teams.html" ${active === "teams" ? 'aria-current="page"' : ""}>Teams</a>
          <a href="/players.html" ${active === "players" ? 'aria-current="page"' : ""}>Players</a>
          <a href="/schedule.html" ${active === "schedule" ? 'aria-current="page"' : ""}>Schedule</a>
        </nav>
        <div class="head-right" data-head-right>
          <a class="small muted" href="/login.html">Sign in</a>
          <a class="btn btn-primary btn-small" href="/create-league.html">Create a league</a>
        </div>
        <div class="switcher" role="group" aria-label="Competition">
          <span class="sw on" aria-current="true">Marvel Rivals <i>Live</i></span>
          <a class="sw" href="/#games">Deadlock <i>Watching</i></a>
        </div>
        <div class="corner-box" data-corner-box title="Season state">
          <div class="cb-top" data-cb-top>Season</div>
          <div class="cb-bottom" data-cb-bottom>Loading state</div>
        </div>
      </div>`;
    seasonData().then((data) => {
      const box = document.querySelector("[data-corner-box]");
      if (!box || !data) return;
      const s = cornerBoxState(data);
      box.querySelector("[data-cb-top]").textContent = s.top;
      box.querySelector("[data-cb-bottom]").textContent = s.bottom;
    });
  }
  const foot = document.querySelector("[data-chrome-foot]");
  if (foot) {
    foot.innerHTML = `
      <div class="wrap">
        <p class="foot-line" data-foot-line>Pro data is compiled from public sources (Liquipedia, Esports Insider, Dot Esports, official broadcasts) and labelled with its source and date wherever it appears. Not affiliated with NetEase, Marvel, or Riot Games.</p>
      </div>`;
    seasonData().then((data) => {
      const line = document.querySelector("[data-foot-line]");
      if (!line || !data) return;
      line.textContent += ` Season state as of ${fmtDate(data.asOf)}; data file updated ${fmtDate(data.generatedAt)}.`;
    });
  }
  api("/api/auth/me")
    .then(({ user }) => {
      const right = document.querySelector("[data-head-right]");
      if (!right) return;
      if (user) {
        right.innerHTML = `
          <span class="head-user">${esc(user.displayName)}</span>
          <a class="small muted" href="/dashboard.html">My leagues</a>
          <a class="btn btn-primary btn-small" href="/create-league.html">Create a league</a>`;
      }
    })
    .catch(() => {});
}

/* The season plate: the site's scorebug (study 5.2, from the broadcast
   scorebug teardown, study section 3). Fixed geometry on every surface
   that carries it. Left zone is the protected core, in this order and no
   other: competition wordmark line, stage name, state word, dates. The
   core never moves or resizes. Right zone is the assist area, and its
   only tenant is the running tally. When the tally lands, the tally
   element alone re-ranks for a beat and settles (temporary hierarchy);
   the plate's outer geometry does not change by a pixel. */
export async function renderSeasonPlate(el, { settle = false } = {}) {
  if (!el) return;
  const data = await seasonData();
  if (!data) {
    el.innerHTML = `<div class="wrap"><p class="muted small">Season status is temporarily unavailable.</p></div>`;
    return;
  }
  const live = data.liveNow?.[0];
  const next = data.nextUp;
  const focus = live || next;
  if (!focus) {
    el.innerHTML = `
      <div class="wrap plate-in">
        <div class="plate-core">
          <div class="plate-comp">Marvel Rivals</div>
          <div class="plate-stage">No competition scheduled</div>
          <div class="plate-state">Off season</div>
          <div class="plate-dates">The next event posts here with its dates.</div>
        </div>
        <div class="plate-assist"><div class="plate-tally" data-tally></div></div>
      </div>`;
    fillTally(el);
    return;
  }
  const [compLine, stageName] = focus.name.includes(":")
    ? focus.name.split(":").map((s) => s.trim())
    : [focus.name, focus.stage || ""];
  const loud = live ? isLoudState(live) : false;
  el.classList.toggle("loud", loud);
  if (settle) el.classList.add("settle");
  el.innerHTML = `
    <div class="wrap plate-in">
      <div class="plate-core">
        <div class="plate-comp">${esc(compLine)}</div>
        <div class="plate-stage">${esc(stageName || focus.name)}</div>
        <div class="plate-state${loud ? " loud" : ""}">${live ? "Live now" : "Next up"}</div>
        <div class="plate-dates">${live
          ? `${fmtDate(focus.startsOn)} to ${fmtDate(focus.endsOn)}`
          : `Starts ${fmtDate(focus.startsOn)}`} · ${esc(focus.stage || "")}</div>
      </div>
      <div class="plate-assist">
        <div class="plate-tally" data-tally aria-label="Season tally"></div>
      </div>
    </div>`;
  fillTally(el);
}

/* The tally is the assist zone's only tenant, ever (study 3: no sponsor
   or promo inventory takes the assist area). Figures come from the
   public data files: teams in the circuit, players rostered, fixtures
   played. When the figures land, the tally re-ranks for one beat and
   settles back to base state. */
async function fillTally(plateEl) {
  const tallyEl = plateEl.querySelector("[data-tally]");
  if (!tallyEl) return;
  try {
    const [teamsData, sched] = await Promise.all([
      fetchJson(`/data/v1/${GAME_SLUG}-teams.json`),
      fetchJson(`/data/v1/${GAME_SLUG}-schedule.json`),
    ]);
    const played = (sched.matches || []).filter((m) => m.status === "final").length;
    tallyEl.innerHTML = `
      <span class="t-fig"><b>${teamsData.teams.length}</b> teams in</span>
      <span class="t-fig"><b>${teamsData.players.length}</b> players rostered</span>
      <span class="t-fig"><b>${played}</b> fixtures played</span>`;
    tallyEl.classList.add("swap");
  } catch {
    tallyEl.textContent = "";
  }
}
