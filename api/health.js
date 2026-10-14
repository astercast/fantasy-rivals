import { handler, json } from "../lib/http.js";
import { dbKind, one } from "../lib/db.js";

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
    time: new Date().toISOString(),
  });
});
