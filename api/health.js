import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handler, json } from "../lib/http.js";
import { dbKind, one } from "../lib/db.js";

/* Pulse (2026-10-24, fr-live): data/v1/pulse.json is read from the
   function bundle (vercel.json includeFiles), never fetched from the
   site's own URL. A missing or unhealthy pulse is reported on the
   payload; `ok` keeps its DB meaning so existing checks do not flap
   before the first heartbeat run. */
function readPulse() {
  const candidates = [
    join(process.cwd(), "data", "v1", "pulse.json"),
    join(dirname(fileURLToPath(import.meta.url)), "..", "data", "v1", "pulse.json"),
  ];
  for (const path of candidates) {
    try {
      const p = JSON.parse(readFileSync(path, "utf8"));
      return {
        exists: true,
        healthy: p.healthy === true,
        generated_at: p.generated_at || null,
        sources_ok: p.sources_ok ?? null,
        sources_total: p.sources_total ?? null,
      };
    } catch { /* try the next candidate */ }
  }
  return { exists: false, healthy: false, generated_at: null, sources_ok: null, sources_total: null };
}

export default handler(async (req, res) => {
  let db = "down";
  try {
    await one("SELECT 1 AS ok");
    db = "up";
  } catch {
    db = "down";
  }
  json(res, db === "up" ? 200 : 503, {
    ok: db === "up",
    service: "fantasy-rivals",
    db: { kind: dbKind(), status: db },
    pulse: readPulse(),
    time: new Date().toISOString(),
  });
});
