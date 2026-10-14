// dev-server.mjs - local development server. Serves the static site and
// dispatches /api/* to the same function modules Vercel runs, with a
// req/res shim matching the small surface lib/http.js uses.
// Boots the schema and seeds the game dataset on start.
//
//   RF_DEV_AUTH=1 node scripts/dev-server.mjs   (enables the dev sign-in)
//   PORT=4173 (default)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/plain; charset=utf-8",
};

const { ensureSchema } = await import("../lib/db.js");
await ensureSchema();
const { seedGameData } = await import("../lib/seed-data.js");
const seedSummary = await seedGameData();
console.log("seeded:", seedSummary);

function shimReq(rawReq, bodyText, queryObj) {
  const req = rawReq;
  req.query = queryObj;
  req.body = bodyText || undefined;
  // Make the raw request async-iterable for readBody fallbacks.
  req[Symbol.asyncIterator] = async function* () {
    if (bodyText) yield Buffer.from(bodyText);
  };
  return req;
}

function shimRes(rawRes) {
  const res = rawRes;
  let status = 200;
  let sent = false;
  const headers = {};
  Object.defineProperty(res, "statusCode", {
    get: () => status,
    set: (v) => { status = v; },
  });
  // Node's OutgoingMessage.headersSent is getter-only; track our own flag.
  Object.defineProperty(res, "headersSent", { get: () => sent });
  res.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
  res.getHeader = (k) => headers[k.toLowerCase()];
  const origEnd = rawRes.end.bind(rawRes);
  res.end = (data) => {
    if (sent) return;
    sent = true;
    rawRes.writeHead(status, headers);
    origEnd(data);
  };
  return res;
}

const server = createServer(async (rawReq, rawRes) => {
  const url = new URL(rawReq.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  try {
    if (path.startsWith("/api/")) {
      const rel = path.replace(/^\/api\//, "");
      let file = join(ROOT, "api", rel + ".js");
      if (!existsSync(file)) file = join(ROOT, "api", rel, "index.js"); // Vercel index convention
      if (!existsSync(file)) {
        rawRes.writeHead(404, { "Content-Type": "application/json" });
        return rawRes.end(JSON.stringify({ ok: false, error: { code: "not_found", message: "No such function." } }));
      }
      const chunks = [];
      for await (const c of rawReq) chunks.push(c);
      const bodyText = Buffer.concat(chunks).toString("utf8");
      const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
      const req = shimReq(rawReq, bodyText, Object.fromEntries(url.searchParams.entries()));
      const res = shimRes(rawRes);
      await mod.default(req, res);
      return;
    }
    // Static
    let rel = path === "/" ? "index.html" : path.replace(/^\//, "");
    if (!extname(rel) && !rel.endsWith("/")) rel += ".html";
    const file = normalize(join(ROOT, rel));
    if (!file.startsWith(ROOT) || !existsSync(file)) {
      rawRes.writeHead(404, { "Content-Type": "text/html" });
      return rawRes.end("<h1>404</h1>");
    }
    const data = await readFile(file);
    rawRes.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    rawRes.end(data);
  } catch (err) {
    console.error(err);
    if (!rawRes.headersSent) {
      rawRes.writeHead(500, { "Content-Type": "application/json" });
      rawRes.end(JSON.stringify({ ok: false, error: { code: "internal", message: String(err.message || err) } }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`fantasy-rivals dev server on http://localhost:${PORT} (db: ${process.env.DATABASE_URL ? "postgres" : "sqlite " + (process.env.RF_DB_PATH || ".data/dev.db")})`);
  if (process.env.RF_DEV_AUTH === "1") console.log("RF_DEV_AUTH=1 - dev sign-in provider enabled at /api/auth/oauth-start?provider=dev");
});
