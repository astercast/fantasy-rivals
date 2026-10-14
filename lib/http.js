// http.js - minimal request/response helpers shared by every API function.
// Handlers are written once against this shape and run unchanged on Vercel
// (native req/res) and under scripts/dev-server.mjs (shimmed req/res).

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function fail(res, status, code, message) {
  json(res, status, { ok: false, error: { code, message } });
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function query(req) {
  if (req.query && typeof req.query === "object") return req.query;
  const url = new URL(req.url, "http://localhost");
  return Object.fromEntries(url.searchParams.entries());
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  fail(res, 405, "method_not_allowed", `Use ${allowed.join(" or ")}.`);
}

export function requireUser(req, res, user) {
  if (!user) {
    fail(res, 401, "auth_required", "Sign in to continue.");
    return false;
  }
  return true;
}

// Wrap a handler with schema boot + uniform error surface.
import { ensureSchema } from "./db.js";
export function handler(fn) {
  return async (req, res) => {
    try {
      await ensureSchema();
      await fn(req, res);
    } catch (err) {
      if (!res.headersSent) {
        const code = err.code || "internal";
        const status = err.status || 500;
        if (status >= 500) console.error(err);
        fail(res, status, code, err.expose ? err.message : "Something went wrong.");
      }
    }
  };
}

export function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.expose = true;
  return err;
}
