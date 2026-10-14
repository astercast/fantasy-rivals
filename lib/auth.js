// auth.js - email + password accounts, hashed with scrypt (node:crypto),
// opaque session tokens stored as SHA-256 hashes. No third-party OAuth.

import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { newId, q, one } from "./db.js";

const SESSION_DAYS = 30;

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const tokenHash = (token) => createHash("sha256").update(token).digest("hex");

export async function createUser({ email, displayName, password, isAdmin = 0 }) {
  const { salt, hash } = hashPassword(password);
  const id = newId();
  const now = new Date().toISOString();
  await q(
    "INSERT INTO users (id, email, display_name, pass_hash, pass_salt, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, email.toLowerCase(), displayName, hash, salt, isAdmin, now]
  );
  return { id, email: email.toLowerCase(), displayName, isAdmin };
}

export async function findUserByEmail(email) {
  return one("SELECT * FROM users WHERE email = ?", [String(email).toLowerCase()]);
}

export async function startSession(userId) {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  await q(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    [tokenHash(token), userId, now.toISOString(), expires.toISOString()]
  );
  return token;
}

export async function endSession(token) {
  if (!token) return;
  await q("DELETE FROM sessions WHERE token_hash = ?", [tokenHash(token)]);
}

export async function userForToken(token) {
  if (!token) return null;
  const row = await one(
    `SELECT u.id, u.email, u.display_name, u.is_admin
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
    [tokenHash(token), new Date().toISOString()]
  );
  return row
    ? { id: row.id, email: row.email, displayName: row.display_name, isAdmin: !!row.is_admin }
    : null;
}

export function sessionCookie(token, maxAgeDays = SESSION_DAYS) {
  const parts = [
    `rf_session=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeDays * 86400}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export const clearCookie = () =>
  "rf_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";

export function tokenFromRequest(req) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)rf_session=([a-f0-9]{64})/);
  if (m) return m[1];
  const auth = req.headers.authorization || "";
  const b = auth.match(/^Bearer\s+(.+)$/i);
  return b ? b[1] : null;
}
