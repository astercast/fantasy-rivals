/* site.js, shared chrome, the season plate, and small public-data
   helpers. Loaded on every page.

   V3 chrome: a slim bar (wordmark left, Season / Players / My Leagues,
   account right) and a foot that carries the full site map over one
   line of data sources, update time, art credit. Season state lives
   in the plate on the page, never in the header. */

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
   plate and the foot line. State inside it is calendar-derived at
   build time in scripts/build-site.mjs; the league picker derives the
   same state at request time in api/leagues/meta.js. */
let seasonPromise = null;
export function seasonData() {
  if (!seasonPromise) {
    seasonPromise = fetchJson(`/data/v1/${GAME_SLUG}-season.json`).catch(() => null);
  }
  return seasonPromise;
}

/* The plate's one loud state: the state word takes the red only when
   the season state changes class, the playoffs of the live competition
   or the Grand Finals window. Every other day it sits in ink. */
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
          <a href="/players.html" ${active === "players" ? 'aria-current="page"' : ""}>Players</a>
          <a href="/dashboard.html" ${active === "dashboard" ? 'aria-current="page"' : ""}>My Leagues</a>
        </nav>
        <div class="head-right" data-head-right>
          <a class="small muted" href="/auth.html" ${active === "auth" ? 'aria-current="page"' : ""} style="text-decoration:none">Sign in</a>
          <a class="btn btn-primary btn-small" href="/start.html" ${active === "start" ? 'aria-current="page"' : ""}>Create a league</a>
        </div>
      </div>`;
  }
  const foot = document.querySelector("[data-chrome-foot]");
  if (foot) {
    foot.innerHTML = `
      <div class="wrap">
        <nav class="foot-nav" aria-label="Site map">
          <a href="/">Home</a>
          <a href="/season.html">Season</a>
          <a href="/players.html">Players</a>
          <a href="/dashboard.html">My Leagues</a>
          <a href="/auth.html">Sign in</a>
        </nav>
        <p class="foot-line" data-foot-line>Pro data is compiled from public sources (Liquipedia, Esports Insider, Dot Esports, official broadcasts) and labelled with its source and date wherever it appears. Marvel Rivals art by Marvel and NetEase. Not affiliated with NetEase, Marvel, or Riot Games.</p>
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
          <a class="small muted head-dupe" href="/dashboard.html" style="text-decoration:none">My leagues</a>
          <a class="btn btn-primary btn-small" href="/start.html">Create a league</a>`;
      }
    })
    .catch(() => {});
}

/* The season plate: fixed two-zone geometry on home, season, and
   league alike. Left zone is the protected core, in this order and no
   other: competition, stage, state word, dates. The core never moves
   or resizes. Right zone holds only the tally, whose figures sit in
   fixed-width slots so a tally change shifts nothing. Flat block: no
   border kit, no texture, state changes by cut. */
export async function renderSeasonPlate(el) {
  if (!el) return;
  const data = await seasonData();
  if (!data) {
    el.innerHTML = `<div class="wrap"><p class="muted small" style="padding:24px 0">Season status is temporarily unavailable.</p></div>`;
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

async function fillTally(plateEl) {
  const tallyEl = plateEl.querySelector("[data-tally]");
  if (!tallyEl) return;
  try {
    const [teamsData, sched] = await Promise.all([
      fetchJson(`/data/v1/${GAME_SLUG}-teams.json`),
      fetchJson(`/data/v1/${GAME_SLUG}-schedule.json`),
    ]);
    const finals = (sched.matches || []).filter((m) => m.status === "final");
    const played = finals.length;
    /* The tally's honest edge: the played record does not yet cover
       every region in the directory. Derived from the same two files
       as the figures, so the line can never outlive the data: when a
       region's first final is imported it drops off the line, and
       when no region is missing the line is not printed at all. The
       wording follows the season page's own disclosure. */
    const regionOf = Object.fromEntries(teamsData.teams.map((t) => [t.short, t.region]));
    const inData = [...new Set(teamsData.teams.map((t) => t.region).filter(Boolean))];
    const allRegions = ["Americas", "EMEA", "Pacific", "China"].filter((r) => inData.includes(r))
      .concat(inData.filter((r) => !["Americas", "EMEA", "Pacific", "China"].includes(r)));
    const playedRegions = [...new Set(finals.map((m) => regionOf[m.teamA]).filter(Boolean))];
    const missing = allRegions.filter((r) => !playedRegions.includes(r));
    let note = "";
    if (missing.length) {
      const list = missing.length > 1
        ? missing.slice(0, -1).join(", ") + " and " + missing[missing.length - 1]
        : missing[0];
      note = `<span class="t-note">${playedRegions.length === 1
        ? `Played so far: ${esc(playedRegions[0])} only. `
        : ""}${esc(list)} finals are not imported yet.</span>`;
    }
    tallyEl.innerHTML = `
      <span class="t-fig"><b>${teamsData.teams.length}</b> teams in</span>
      <span class="t-fig"><b>${teamsData.players.length}</b> players rostered</span>
      <span class="t-fig"><b>${played}</b> fixtures played</span>${note}`;
  } catch {
    tallyEl.textContent = "";
  }
}
