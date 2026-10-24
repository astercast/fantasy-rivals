// rate-limit.js - TY4: DB-backed auth attempt limiting.
// 5 tries per IP per action per 10 minutes, counted in the database
// (auth_attempts) so the limit holds across serverless instances,
// unlike an in-memory counter that every cold start would reset.
import { all, run } from "./db.js";

export const WINDOW_MS = 10 * 60 * 1000;
export const MAX_TRIES = 5;

export function clientIp(req) {
  const fwd = (req.headers && (req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"])) || "";
  const first = String(fwd).split(",")[0].trim();
  return first || (req.socket && req.socket.remoteAddress) || "unknown";
}

export async function tooManyAttempts(req, action) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const rows = await all(
    "SELECT COUNT(*) AS n FROM auth_attempts WHERE ip = ? AND action = ? AND at >= ?",
    [clientIp(req), action, since]
  );
  return (rows[0]?.n || 0) >= MAX_TRIES;
}

export async function recordAttempt(req, action) {
  await run("INSERT INTO auth_attempts (ip, action, at) VALUES (?, ?, ?)",
    [clientIp(req), action, new Date().toISOString()]);
}
