/* status.js: the Season Status Plate. The state is computed from the clock in the browser, from dates only.
   It flips at the real boundary with no deploy and no server. Usage: mountStatus(el, "/data/v1/marvel-rivals-season.json") */
const DAY = 864e5;
const at = (d, end) => Date.parse(d + (end ? "T23:59:59Z" : "T00:00:00Z"));
export function stateOf(seasons, now = Date.now()) {
  const live = seasons.find((s) => now >= at(s.startsOn) && now <= at(s.endsOn, 1));
  if (live) return { kind: "live", s: live, to: at(live.endsOn, 1) };
  const next = seasons.filter((s) => at(s.startsOn) > now).sort((a, b) => at(a.startsOn) - at(b.startsOn))[0];
  const prev = seasons.filter((s) => at(s.endsOn, 1) < now).sort((a, b) => at(b.endsOn, 1) - at(a.endsOn, 1))[0];
  if (next) return { kind: prev ? "between" : "next", s: next, prev, to: at(next.startsOn) };
  return { kind: "complete", s: prev || seasons[seasons.length - 1] };
}
const WORD = { live: "LIVE NOW", between: "BETWEEN STAGES", next: "NEXT", complete: "SEASON COMPLETE" };
const pad = (n, w = 2) => String(n).padStart(w, "0");
export function parts(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor(t % 86400 / 3600), m: Math.floor(t % 3600 / 60), s: t % 60 };
}
export async function mountStatus(el, url, opts = {}) {
  const now = opts.now || (() => Date.now());
  const data = await (await fetch(url, { cache: "no-store" })).json();
  const seasons = data.seasons || [];
  const draw = () => {
    const st = stateOf(seasons, now()), p = st.to ? parts(st.to - now()) : null;
    if (el.dataset.state !== st.kind || el.dataset.id !== st.s.name) {
      el.dataset.state = st.kind; el.dataset.id = st.s.name;
      el.innerHTML = `<div class="sp-word">${WORD[st.kind]}</div><div class="sp-name"></div><div class="sp-clock" aria-hidden="true"></div><div class="sp-note"></div>`;
      el.querySelector(".sp-name").textContent = st.s.name.replace(/^Marvel Rivals /, "");
      el.querySelector(".sp-note").textContent = st.kind === "complete" ? "" : st.s.stage || "";
      el.setAttribute("role", "status");
    }
    const c = el.querySelector(".sp-clock");
    c.innerHTML = p ? [["d", "DAYS"], ["h", "HRS"], ["m", "MIN"], ["s", "SEC"]]
      .map(([k, l]) => `<span><b>${pad(p[k])}</b><i>${st.kind === "live" && k === "d" ? "DAYS LEFT" : l}</i></span>`).join("") : "";
    el.setAttribute("aria-label", `${WORD[st.kind]}: ${st.s.name}`);
  };
  draw(); const id = setInterval(draw, 1000); return () => clearInterval(id);
}

/* Mini strip: the same state on one line, sticky under the nav on every
   page. Added in the fleet reconciliation (fr-live shipped the full plate
   only); it reuses stateOf/parts/WORD above, so strip and plate can never
   disagree. */
export async function mountMini(el, url, opts = {}) {
  const now = opts.now || (() => Date.now());
  const data = await (await fetch(url, { cache: "no-store" })).json();
  const seasons = data.seasons || [];
  const draw = () => {
    const st = stateOf(seasons, now()), p = st.to ? parts(st.to - now()) : null;
    el.dataset.state = st.kind;
    const clock = p ? (st.kind === "live" ? `${pad(p.d)}d ${pad(p.h)}h left` : `starts in ${pad(p.d)}d ${pad(p.h)}h`) : "";
    el.innerHTML = `<span class="sm-dot" aria-hidden="true"></span><span class="sm-word">${WORD[st.kind]}</span><span class="sm-name"></span>` +
      (clock ? `<span class="sm-clock"></span>` : "");
    el.querySelector(".sm-name").textContent = st.s.name.replace(/^Marvel Rivals /, "");
    if (clock) el.querySelector(".sm-clock").textContent = clock;
    el.setAttribute("aria-label", `${WORD[st.kind]}: ${st.s.name}`);
  };
  draw(); const id = setInterval(draw, 1000); return () => clearInterval(id);
}
