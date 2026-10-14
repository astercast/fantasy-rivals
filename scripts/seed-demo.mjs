// seed-demo.mjs - a seeded demo league in the local dev DB so the product
// can be eyeballed end-to-end: an admin, a commissioner, three managers,
// and a forming league for the live Stage 2 competition. Idempotent.
//   node scripts/seed-demo.mjs        (or: npm run seed)

import { ensureSchema, q, one } from "../lib/db.js";
import { seedGameData } from "../lib/seed-data.js";
import { createUser, findUserByEmail } from "../lib/auth.js";
import { createInvite, listMembers, logEvent, now } from "../lib/league.js";
import { DEFAULT_SCORING, SQUAD_SCORING, DEFAULT_ROSTER } from "../lib/scoring.js";
import { newId } from "../lib/db.js";

await ensureSchema();
console.log("seed:", await seedGameData());

const PEOPLE = [
  { email: "admin@demo.rivals.gg", name: "Site Admin", password: "demo-admin-password", admin: 1 },
  { email: "commish@demo.rivals.gg", name: "Demo Commissioner", password: "demo-password-1", team: "Commissioner's XI" },
  { email: "manager2@demo.rivals.gg", name: "Manager Two", password: "demo-password-2", team: "Second Seed" },
  { email: "manager3@demo.rivals.gg", name: "Manager Three", password: "demo-password-3", team: "Third Time Lucky" },
  { email: "manager4@demo.rivals.gg", name: "Manager Four", password: "demo-password-4", team: "Fourth Wall" },
];
const users = {};
for (const p of PEOPLE) {
  let u = await findUserByEmail(p.email);
  if (!u) {
    u = await createUser({ email: p.email, displayName: p.name, password: p.password, isAdmin: p.admin || 0 });
    console.log("created user", p.email);
  }
  users[p.email] = { ...p, id: u.id };
}

const season = await one(
  "SELECT * FROM seasons WHERE name LIKE '%Stage 2%' ORDER BY starts_on ASC LIMIT 1"
);
if (!season) throw new Error("Stage 2 competition not found in seed data");
const commish = users["commish@demo.rivals.gg"];
let league = await one(
  "SELECT * FROM leagues WHERE commissioner_id = ? AND name = 'Foundry Demo League'",
  [commish.id]
);
if (!league) {
  const id = newId();
  const settings = {
    scoring: DEFAULT_SCORING,
    squadScoring: SQUAD_SCORING,
    roster: DEFAULT_ROSTER,
    pickClockSeconds: 120,
    regularWeeks: 3,
    playoffTeams: 4,
  };
  await q(
    `INSERT INTO leagues (id, game_id, season_id, name, commissioner_id, size, status, settings, created_at)
     VALUES (?, ?, ?, 'Foundry Demo League', ?, 4, 'forming', ?, ?)`,
    [id, season.game_id, season.id, commish.id, JSON.stringify(settings), now()]
  );
  league = await one("SELECT * FROM leagues WHERE id = ?", [id]);
  console.log("created league", league.id);
}
for (const p of PEOPLE.slice(1)) {
  const u = users[p.email];
  const existing = await one(
    "SELECT * FROM league_members WHERE league_id = ? AND user_id = ?",
    [league.id, u.id]
  );
  if (!existing) {
    await q(
      "INSERT INTO league_members (id, league_id, user_id, team_name, joined_at) VALUES (?, ?, ?, ?, ?)",
      [newId(), league.id, u.id, p.team, now()]
    );
    await logEvent(league.id, "member_joined", { teamName: p.team, demo: true });
    console.log("joined:", p.team);
  }
}
const invite = await createInvite(league.id, commish.id);
const members = await listMembers(league.id);
console.log("\nDemo league ready:");
console.log("  league:", league.name, `(${league.id}) - competition: ${season.name}`);
console.log("  members:", members.map((m) => m.team_name).join(" · "));
console.log("  invite code:", invite);
console.log("  sign in as commish@demo.rivals.gg / demo-password-1 (admin: admin@demo.rivals.gg / demo-admin-password)");
console.log("  then open the league room and start the draft.");
