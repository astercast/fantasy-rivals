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
  /* Season Status Plate mini strip + pulse (2026-10-24, fr-live): one
     sticky line under the nav on EVERY page, state computed in the
     browser from the season dates every second by status.js (the full
     plate lives on home and season). Pulse is the quiet data-freshness
     bar driven by data/v1/pulse.json. Both load from here so no page
     can miss them; a failure removes the strip and says nothing. */
  if (head && !document.querySelector("[data-status-mini]")) {
    const mini = document.createElement("div");
    mini.className = "status-mini";
    mini.setAttribute("data-status-mini", "");
    mini.setAttribute("role", "status");
    head.after(mini);
    import("/assets/js/status.js")
      .then((m) => m.mountMini(mini, `/data/v1/${GAME_SLUG}-season.json`))
      .catch(() => mini.remove());
    import("/assets/js/pulse.js").catch(() => {});
  }
  if (head) {
    head.innerHTML = `
      <div class="band">
        <a class="wordmark" href="/">Rivals<span class="dot">·</span>Fantasy</a>
        <nav class="main-nav" aria-label="Primary">
          <a href="/season.html" ${active === "season" ? 'aria-current="page"' : ""}>Season</a>
          <a href="/players.html" ${active === "players" ? 'aria-current="page"' : ""}>Players</a>
          <a href="/dashboard.html" ${active === "dashboard" ? 'aria-current="page"' : ""}>My Leagues</a>
        </nav>
        <div class="head-right" data-head-right>
          <a class="head-link" href="/auth.html" ${active === "auth" ? 'aria-current="page"' : ""}>Sign in</a>
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
        document.querySelectorAll('.foot-nav a[href="/auth.html"]').forEach((a) => a.remove());
        right.innerHTML = `
          <span class="head-user">${esc(user.displayName)}</span>
          <a class="small muted head-dupe" href="/dashboard.html" style="text-decoration:none">My leagues</a>
          <a class="btn btn-primary btn-small" href="/start.html">Create a league</a>`;
      }
    })
    .catch(() => {});
}

/* The season plate: fixed two-zone geometry on home and season.
   Left zone is the protected core, in this order and no other:
   competition, stage, state word, dates. The core never moves
   or resizes. Right zone holds only the tally, whose figures sit in
   fixed-width slots so a tally change shifts nothing. Flat block: no
   border kit, no texture, state changes by cut. The league room opts
   into the compact variant (data-plate-compact): the same core on
   one line, no tally. */
export async function renderSeasonPlate(el) {
  if (!el) return;
  /* The compact variant (the league room opts in with
     data-plate-compact): the same core on one line, no tally, so the
     page's own subject leads. Same data, same component. */
  const compact = el.hasAttribute("data-plate-compact");
  const data = await seasonData();
  if (!data) {
    el.innerHTML = `<div class="wrap"><p class="muted small" style="padding:24px 0">Season status is temporarily unavailable.</p></div>`;
    return;
  }
  /* FA2 (rotation 140): Live and Next are computed from the season
     dates on the visitor's clock. The stored liveNow / nextUp fields
     are never trusted: old data cannot claim a match is live. */
  const todayStr = new Date().toLocaleDateString("en-CA");
  const seasons = [...(data.seasons || [])].sort((a, b) => (a.startsOn || "").localeCompare(b.startsOn || ""));
  const live = seasons.find((s) => s.startsOn <= todayStr && todayStr <= s.endsOn);
  const next = seasons.find((s) => s.startsOn > todayStr);
  const focus = live || next;
  if (!focus) {
    if (compact) {
      el.innerHTML = `
      <div class="wrap plate-in compact">
        <span class="plate-comp">Marvel Rivals</span>
        <span class="plate-state">Off season</span>
        <span class="plate-dates">The next event posts here with its dates.</span>
      </div>`;
      return;
    }
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
  if (compact) {
    el.innerHTML = `
    <div class="wrap plate-in compact">
      <span class="plate-comp">${esc(compLine)}</span>
      <span class="plate-stage-s">${esc(stageName || focus.name)}</span>
      <span class="plate-state${loud ? " loud" : ""}">${live ? "Live now" : "Next up"}</span>
      <span class="plate-dates">${live
        ? `${fmtDate(focus.startsOn)} to ${fmtDate(focus.endsOn)}`
        : `Starts ${fmtDate(focus.startsOn)}`} · ${esc(focus.stage || "")}</span>
    </div>`;
    return;
  }
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

/* --- the hero portrait system (image density pass, 2026-10-24) ---
   The repo's portrait set is the game's 54 heroes, official art
   (provenance: assets/img/MANIFEST.md). Portraits are heroes, never
   pro players: beside a pro, a portrait is that pro's listed
   signature hero from the pool data, and it renders only where the
   data lists one — never invented for a pro who has none listed. */
export const HERO_PORTRAITS = [
  ["Doctor Strange", "Vanguard"], ["Magneto", "Vanguard"], ["Hulk", "Vanguard"],
  ["Captain America", "Vanguard"], ["Angela", "Vanguard"], ["Devil Dinosaur", "Vanguard"],
  ["Emma Frost", "Vanguard"], ["Groot", "Vanguard"], ["Peni Parker", "Vanguard"],
  ["Rogue", "Vanguard"], ["The Hood", "Vanguard"], ["The Thing", "Vanguard"],
  ["Thor", "Vanguard"], ["Venom", "Vanguard"],
  ["Iron Man", "Duelist"], ["Spider-Man", "Duelist"], ["Magik", "Duelist"],
  ["Hela", "Duelist"], ["Black Cat", "Duelist"], ["Black Panther", "Duelist"],
  ["Black Widow", "Duelist"], ["Blade", "Duelist"], ["Cyclops", "Duelist"],
  ["Daredevil", "Duelist"], ["Deadpool", "Duelist"], ["Elsa Bloodstone", "Duelist"],
  ["Gorr the God Butcher", "Duelist"], ["Hawkeye", "Duelist"], ["Human Torch", "Duelist"],
  ["Iron Fist", "Duelist"], ["Mister Fantastic", "Duelist"], ["Moon Knight", "Duelist"],
  ["Namor", "Duelist"], ["Phoenix", "Duelist"], ["Psylocke", "Duelist"],
  ["Scarlet Witch", "Duelist"], ["Squirrel Girl", "Duelist"], ["Star-Lord", "Duelist"],
  ["Storm", "Duelist"], ["The Punisher", "Duelist"], ["Winter Soldier", "Duelist"],
  ["Wolverine", "Duelist"],
  ["Luna Snow", "Strategist"], ["Rocket Raccoon", "Strategist"], ["Adam Warlock", "Strategist"],
  ["Jeff the Land Shark", "Strategist"], ["Cloak & Dagger", "Strategist"], ["Gambit", "Strategist"],
  ["Invisible Woman", "Strategist"], ["Jubilee", "Strategist"], ["Loki", "Strategist"],
  ["Mantis", "Strategist"], ["Ultron", "Strategist"], ["White Fox", "Strategist"],
];
const HERO_SLUG_SPECIAL = { "Cloak & Dagger": "cloakanddagger" };
export function heroPortraitUrl(name) {
  const slug = HERO_SLUG_SPECIAL[name] ||
    String(name).toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `/assets/img/heroes/hero-portrait-${slug}.png`;
}
/* The same portrait as a <picture>: generated AVIF, then WebP, with
   the shipped PNG as the fallback <img>. Used by the block surfaces
   (wall, ribbon, spotlight); the small face chips keep the plain PNG. */
export function heroPictureHtml(name, { w = 154, h = 280 } = {}) {
  const png = heroPortraitUrl(name);
  const base = png.replace(/\.png$/, "");
  return `<picture><source type="image/avif" srcset="${base}.avif"><source type="image/webp" srcset="${base}.webp">` +
    `<img src="${png}" width="${w}" height="${h}" alt="${esc(name)}" loading="lazy"></picture>`;
}
export function heroFaceImg(heroName) {
  if (!heroName) return "";
  return `<img class="p-face" src="${heroPortraitUrl(heroName)}" alt="${esc(heroName)}" title="${esc(heroName)}" loading="lazy">`;
}
/* A pro's face chip: the portrait of the first hero the pool lists
   for them, or nothing when the pool lists none. */
export function playerFaceImg(player) {
  const hero = player?.heroes?.[0];
  return hero ? heroFaceImg(hero) : "";
}
export function heroStackHtml(heroNames, limit = 3) {
  const names = [...new Set(heroNames || [])].slice(0, limit);
  if (!names.length) return "";
  return `<span class="p-stack" aria-hidden="true">${names.map((n) =>
    `<img src="${heroPortraitUrl(n)}" alt="" loading="lazy">`).join("")}</span>`;
}
/* A pro team's stack: the signature heroes of its rostered pros, in
   draft order, from the same teams data the pool renders from. */
export function teamHeroStackHtml(teamsData, short, limit = 3) {
  if (!teamsData || !short) return "";
  const names = (teamsData.players || [])
    .filter((p) => p.team === short && p.heroes?.length)
    .sort((a, b) => (a.draftRank ?? 999) - (b.draftRank ?? 999))
    .map((p) => p.heroes[0]);
  return heroStackHtml(names, limit);
}
const HERO_ROLE_LINE = {
  Vanguard: "Vanguards hold the front line and take the space fights start from.",
  Duelist: "Duelists deal the damage and finish the fights.",
  Strategist: "Strategists heal and set up the team to win the fight.",
};
/* The full 54-hero wall, grouped by role — the same markup and
   classes as the players-page hero strip. */
export function heroWallHtml() {
  return `<div class="hero-strip">${["Vanguard", "Duelist", "Strategist"].map((role) => `
    <div class="hero-group">
      <h3>${role}</h3>
      <p class="role-line">${HERO_ROLE_LINE[role]}</p>
      <div class="hero-portraits">
        ${HERO_PORTRAITS.filter(([, r]) => r === role).map(([name]) => `
          <figure>${heroPictureHtml(name)}<figcaption>${esc(name)}</figcaption></figure>`).join("")}
      </div>
    </div>`).join("")}
  </div>`;
}
export function renderHeroWall(el) {
  if (el) el.innerHTML = heroWallHtml();
}
/* A sideways portrait ribbon of all 54 heroes, each face a link. */
export function heroRibbonHtml(href) {
  return HERO_PORTRAITS.map(([name, role]) => `
    <figure><a href="${href}" data-open-heroes title="${esc(name)} · ${esc(role)}">${heroPictureHtml(name)}</a><figcaption>${esc(name)}</figcaption></figure>`).join("");
}
const SPOT_ROLE_CLASS = { Vanguard: "van", Duelist: "due", Strategist: "str" };
/* A spotlight card for one pro: the art is their listed signature
   hero's official portrait, and the card says so on its face. */
export function spotCardHtml(p, teamName) {
  const hero = p.heroes?.[0];
  if (!hero) return "";
  return `
    <article class="spot-card">
      <div class="sc-art">${heroPictureHtml(hero)}</div>
      <div class="sc-body">
        <p class="sc-ign">${esc(p.ign)} <span class="role ${SPOT_ROLE_CLASS[p.role] || ""}">${esc(p.role)}</span></p>
        <p class="sc-meta">#${p.draftRank ?? "·"} on the board · ${esc(teamName || p.team || "")}</p>
        <p class="sc-hero">Signature hero: ${esc(hero)}</p>
      </div>
    </article>`;
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
      <div class="t-cell"><span class="t-num">${teamsData.teams.length}</span><span class="t-label">Teams in</span></div>
      <div class="t-cell"><span class="t-num">${teamsData.players.length}</span><span class="t-label">Players rostered</span></div>
      <div class="t-cell"><span class="t-num">${played}</span><span class="t-label">Fixtures played</span></div>${note}`;
  } catch {
    tallyEl.textContent = "";
  }
}
