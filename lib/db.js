// db.js - data access for Rivals Fantasy.
//
// Two adapters behind one tiny interface, chosen by environment:
//   - DATABASE_URL set  -> Neon Postgres over the serverless driver (production).
//   - otherwise         -> embedded node:sqlite file DB (local dev / tests).
//
// Handlers and domain code call `q(sql, params)` with `?` placeholders and
// `one()` / `all()` / `run()` helpers. The Postgres adapter rewrites `?` to
// $1..$n. Keep SQL dialect-neutral: standard SQL only, no RETURNING (use a
// follow-up SELECT), no serial types in queries (ids are app-generated).

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const newId = () => randomUUID();

let adapter = null;

export function dbKind() {
  return process.env.DATABASE_URL ? "postgres" : "sqlite";
}

async function getAdapter() {
  if (adapter) return adapter;
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    adapter = {
      kind: "postgres",
      async query(text, params = []) {
        let i = 0;
        const pgText = text.replace(/\?/g, () => `$${++i}`);
        // @neondatabase/serverless 0.10.x: the object returned by neon() IS
        // the query function - call sql(text, params) directly (there is no
        // sql.query method; only sql.transaction hangs off it). It resolves
        // to the rows array by default, matching this adapter's contract.
        const rows = await sql(pgText, params);
        return rows;
      },
    };
  } else {
    const { DatabaseSync } = await import("node:sqlite");
    const path = process.env.RF_DB_PATH || ".data/dev.db";
    mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    adapter = {
      kind: "sqlite",
      async query(text, params = []) {
        const stmt = db.prepare(text);
        const verb = text.trimStart().slice(0, 6).toUpperCase();
        if (verb === "SELECT" || verb === "WITH RE") {
          return stmt.all(...params);
        }
        stmt.run(...params);
        return [];
      },
      raw: db,
    };
  }
  return adapter;
}

export async function q(text, params = []) {
  const a = await getAdapter();
  return a.query(text, params);
}
export async function one(text, params = []) {
  const rows = await q(text, params);
  return rows[0] || null;
}
export async function all(text, params = []) {
  return q(text, params);
}
export async function run(text, params = []) {
  return q(text, params);
}

// Schema is applied idempotently (CREATE TABLE IF NOT EXISTS) so both the
// local file DB and Neon converge on first boot. The canonical DDL also
// lives in db/schema.sql for review and manual migration.
import { SCHEMA } from "./schema.js";
let schemaReady = null;
export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const a = await getAdapter();
      if (a.kind === "sqlite") {
        a.raw.exec(SCHEMA);
      } else {
        for (const stmt of SCHEMA.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
          await a.query(stmt);
        }
      }
    })();
  }
  return schemaReady;
}
