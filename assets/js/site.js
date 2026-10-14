/* site.js, shared chrome (header/footer), the season-status band, and
   small public-data helpers. Loaded on every page. */

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

export function renderChrome(active) {
  const head = document.querySelector("[data-chrome-head]");
  if (head) {
    head.innerHTML = `
      <div class="wrap">
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
      </div>`;
  }
  const foot = document.querySelector("[data-chrome-foot]");
  if (foot) {
    foot.innerHTML = `
      <div class="wrap">
        <div class="foot-cols">
          <div>
            <div class="wordmark">Rivals<span class="dot">·</span>Fantasy</div>
            <p class="fine" style="margin-top:8px">Fantasy esports, starting with the Marvel Rivals pro scene. More games join this same site as their pro scenes launch.</p>
          </div>
          <div>
            <h4>Explore</h4>
            <a href="/season.html">Season</a>
            <a href="/teams.html">Teams</a>
            <a href="/players.html">Players</a>
            <a href="/schedule.html">Schedule</a>
            <a href="/create-league.html">Create a league</a>
          </div>
          <div>
            <h4>About the data</h4>
            <p class="fine">Pro data is compiled from public sources (Liquipedia, Esports Insider, Dot Esports, official broadcasts) and labelled with its source and date wherever it appears. Rosters are the published 2026 lineups; a team's page says so when its roster is still to be announced. Not affiliated with NetEase, Marvel, or Riot Games.</p>
          </div>
        </div>
      </div>`;
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

/* The season-clarity band: states plainly what is live / what is next,
   dated and sourced, from the precomputed public season file. */
export async function renderSeasonStatus(el, { dark = false } = {}) {
  if (!el) return;
  try {
    const data = await fetchJson(`/data/v1/${GAME_SLUG}-season.json`);
    const live = data.liveNow?.[0];
    const next = data.nextUp;
    if (live) {
      el.innerHTML = `
        <div class="wrap">
          <span class="status-pill"><span class="pulse"></span>Live now</span>
          <div class="status-main">
            <div class="comp-name">${esc(live.name)}</div>
            <div class="comp-meta">${esc(live.stage)} · ${fmtDate(live.startsOn)} to ${fmtDate(live.endsOn)} · League creation is open for this competition.</div>
          </div>
          ${next ? `<div class="status-next"><div class="fine">Next up</div><div class="n-name">${esc(next.name)}</div><div class="fine">Starts ${fmtDate(next.startsOn)}</div></div>` : ""}
        </div>
        <div class="wrap" style="padding-top:0"><p class="fine">Competition state as of ${fmtDate(data.asOf)}. ${esc(live.sourceNote || "")}</p></div>`;
    } else if (next) {
      el.innerHTML = `
        <div class="wrap">
          <span class="status-pill next"><span class="pulse"></span>Next up</span>
          <div class="status-main">
            <div class="comp-name">${esc(next.name)}</div>
            <div class="comp-meta">${esc(next.stage)} · starts ${fmtDate(next.startsOn)}. Nothing is live right now, league creation is open in advance for this one.</div>
          </div>
        </div>
        <div class="wrap" style="padding-top:0"><p class="fine">Competition state as of ${fmtDate(data.asOf)}. ${esc(next.sourceNote || "")}</p></div>`;
    } else {
      el.innerHTML = `<div class="wrap"><div class="status-main"><div class="comp-name">No competition scheduled</div><div class="comp-meta">Check back, the next event will be posted here with its start date.</div></div></div>`;
    }
    if (dark) el.classList.add("on-dark");
  } catch {
    el.innerHTML = `<div class="wrap"><p class="muted small">Season status is temporarily unavailable.</p></div>`;
  }
}
