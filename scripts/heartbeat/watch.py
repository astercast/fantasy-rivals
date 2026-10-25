"""Fantasy Rivals source watcher. One Liquipedia API call per run (their terms: real user agent, gzip, low rate).
It does NOT write results. It only notices that a source page changed, so a person re-reads it and imports through db/imports.
Writes data/v1/pulse.json and data/v1/season-live.json (computed state for the day, a fallback if JS is off)."""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import get_json, read, write_if_changed, Pulse, now
from datetime import datetime, timezone
UA = {"User-Agent": "FantasyRivals-sourcewatch/1.0 (+https://github.com/astercast/fantasy-rivals)"}
PAGES = ["MR Ignite/2026/Stage 2/Americas", "MR Ignite/2026/Stage 2/EMEA", "MR Ignite/2026/Stage 2/Pacific",
         "MR Ignite/2026/Stage 2/Pacific/Oceania", "MR Ignite/2026/Grand Finals", "MR Ignite/2026/Mid Season Finals"]
URL = "https://liquipedia.net/marvelrivals/api.php?action=query&prop=revisions&rvprop=ids|timestamp&format=json&titles="
def main():
    p = Pulse(stale_after_h=30)
    j, err = get_json(URL + "|".join(t.replace(" ", "_") for t in PAGES), headers=UA)
    rev = read("source-revisions.json", {"pages": {}})
    if j is None:
        p.source("liquipedia", "Liquipedia pages", False, error=err, url="https://liquipedia.net/marvelrivals/")
    else:
        cur, n = dict(rev["pages"]), 0
        for pg in j["query"]["pages"].values():
            if "revisions" not in pg: continue
            n += 1; r = pg["revisions"][0]; old = cur.get(pg["title"])
            if old and old["rev"] != r["revid"]:
                p.change("source", f'Source page edited: {pg["title"]} (check results)', ref=pg["title"])
            cur[pg["title"]] = {"rev": r["revid"], "at": r["timestamp"]}
        p.source("liquipedia", "Liquipedia pages", n > 0, items=n, error=None if n else "no pages", url="https://liquipedia.net/marvelrivals/")
        write_if_changed("source-revisions.json", {"pages": cur})
    season = read("marvel-rivals-season.json", {"seasons": []})
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    st = [{"name": s["name"], "state": "upcoming" if today < s["startsOn"] else "complete" if today > s["endsOn"] else "live"} for s in season.get("seasons", [])]
    if write_if_changed("season-live.json", {"format": "season-live/1", "asOf": today, "generated_at": now(), "seasons": st}):
        p.change("state", "Season status changed for " + today)
    p.write(); print("ok" if j else "source failed:", err, len(PAGES))
main()
