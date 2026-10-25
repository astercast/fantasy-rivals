/* media.js: every picture on the site goes through here, so the sizes, formats,
   fallbacks and credits are decided in one place. */
import { esc } from "/assets/js/site.js";

const W = [640, 1024, 1440];
/* Which official still sits behind which stage or match. Chosen from the 43 Steam
   screenshots: map and arena shots without the game's on-screen interface. */
export const STAGE_ART = {
  "Preseason": "stage/steam-37", "Stage 1": "stage/steam-38",
  "Mid-Season Finals": "stage/steam-35", "Stage 2": "stage/steam-34",
  "Grand Finals": "stage/steam-16",
};
const MATCH_ART = ["stage/steam-20", "stage/steam-23", "stage/steam-33", "stage/steam-36", "stage/steam-32", "stage/steam-29"];
export const matchArt = (i) => MATCH_ART[i % MATCH_ART.length];
export const stageArt = (name) => STAGE_ART[(name || "").replace(/^Marvel Rivals Ignite 2026:\s*/, "")] || MATCH_ART[0];

/* A responsive picture: AVIF, then WebP, in three widths. width/height are always set
   so nothing jumps, and the box has a colour so a slow image never leaves a hole. */
export function pic(base, { alt = "", sizes = "100vw", w = 1440, h = 810, eager = false, cls = "" } = {}) {
  const set = (ext) => W.map((x) => `/assets/img/${base}-${x}.${ext} ${x}w`).join(", ");
  return `<picture class="${cls}"><source type="image/avif" srcset="${set("avif")}" sizes="${sizes}">` +
    `<source type="image/webp" srcset="${set("webp")}" sizes="${sizes}">` +
    `<img src="/assets/img/${base}-1024.webp" width="${w}" height="${h}" alt="${esc(alt)}" decoding="async" ` +
    `${eager ? 'fetchpriority="high"' : 'loading="lazy"'} onerror="this.closest('picture').classList.add('dead');this.remove()"></picture>`;
}

/* Slug rule reconciled with site.js (round 3): "&" is dropped, not spelled
   out, so "Cloak & Dagger" maps to the shipped file hero-portrait-cloakanddagger. */
const HERO_SLUG_SPECIAL = { "Cloak & Dagger": "cloakanddagger" };
const slug = (n) => HERO_SLUG_SPECIAL[n] ||
  String(n).toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/* hero cutout: official art of the HERO, labelled as the hero, never as the person */
export function hero(name, { eager = false } = {}) {
  const s = slug(name);
  return `<picture class="hero-cut"><source type="image/avif" srcset="/assets/img/heroes/hero-portrait-${s}.avif">` +
    `<img src="/assets/img/heroes/hero-portrait-${s}.webp" width="154" height="280" alt="${esc(name)}, the hero" decoding="async" ` +
    `${eager ? "" : 'loading="lazy"'} onerror="this.closest('picture').remove()"></picture>`;
}

/* team plate: the logo if /assets/img/teams/<short>.svg|png exists, else the letters on a plate.
   The letters are always underneath, so a missing or broken logo costs nothing. */
/* assets/img/teams/index.json lists the logo files that exist, e.g. {"vp":"svg","100t":"png"}.
   Teams not listed get the letter plate and cause no request at all. */
const LOGOS = await fetch("/assets/img/teams/index.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
export function teamPlate(short, name = "") {
  const k = short.toLowerCase().replace(/[^a-z0-9]/g, "");
  const ext = LOGOS[k];
  return `<span class="tplate" title="${esc(name)}"><span class="tp-ltr">${esc(short.slice(0, 4))}</span>` +
    (ext ? `<img src="/assets/img/teams/${k}.${ext}" alt="" width="64" height="64" loading="lazy" decoding="async" onerror="this.remove()">` : "") + `</span>`;
}
export const ROLE_CLASS = { Vanguard: "van", Duelist: "due", Strategist: "str" };
