// Canonical DDL (dialect-neutral: runs on SQLite and Postgres unchanged).
// Ids are app-generated UUIDs (TEXT). Timestamps are ISO-8601 TEXT.
// JSON payloads are TEXT. The same text lives in db/schema.sql for review.

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT '',
  starts_on TEXT NOT NULL DEFAULT '',
  ends_on TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'current',
  source_note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS pro_teams (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL,
  short TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  pro_team_id TEXT REFERENCES pro_teams(id),
  ign TEXT NOT NULL,
  real_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  heroes TEXT NOT NULL DEFAULT '[]',
  draft_rank INTEGER NOT NULL DEFAULT 999,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  week INTEGER NOT NULL DEFAULT 1,
  round_label TEXT NOT NULL DEFAULT '',
  team_a_id TEXT REFERENCES pro_teams(id),
  team_b_id TEXT REFERENCES pro_teams(id),
  starts_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  score_a INTEGER,
  score_b INTEGER,
  source TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS player_match_stats (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  map_label TEXT NOT NULL DEFAULT '',
  heroes TEXT NOT NULL DEFAULT '[]',
  eliminations REAL NOT NULL DEFAULT 0,
  deaths REAL NOT NULL DEFAULT 0,
  assists REAL NOT NULL DEFAULT 0,
  final_hits REAL NOT NULL DEFAULT 0,
  damage_dealt REAL NOT NULL DEFAULT 0,
  damage_blocked REAL NOT NULL DEFAULT 0,
  healing REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  UNIQUE(match_id, player_id, map_label)
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(provider, provider_user_id)
);
CREATE TABLE IF NOT EXISTS auth_attempts (
  ip TEXT NOT NULL,
  action TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  season_id TEXT REFERENCES seasons(id),
  name TEXT NOT NULL,
  commissioner_id TEXT NOT NULL REFERENCES users(id),
  size INTEGER NOT NULL DEFAULT 6,
  status TEXT NOT NULL DEFAULT 'forming',
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  code TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS league_members (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  team_name TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  UNIQUE(league_id, user_id)
);
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL UNIQUE REFERENCES leagues(id),
  status TEXT NOT NULL DEFAULT 'pending',
  order_json TEXT NOT NULL DEFAULT '[]',
  current_pick INTEGER NOT NULL DEFAULT 0,
  pick_deadline TEXT,
  started_at TEXT,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS draft_picks (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  pick_no INTEGER NOT NULL,
  round INTEGER NOT NULL,
  member_id TEXT NOT NULL REFERENCES league_members(id),
  player_id TEXT REFERENCES players(id),
  pro_team_id TEXT REFERENCES pro_teams(id),
  picked_at TEXT NOT NULL,
  auto INTEGER NOT NULL DEFAULT 0,
  UNIQUE(draft_id, pick_no),
  UNIQUE(draft_id, player_id),
  UNIQUE(draft_id, pro_team_id)
);
CREATE TABLE IF NOT EXISTS roster_entries (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  member_id TEXT NOT NULL REFERENCES league_members(id),
  player_id TEXT REFERENCES players(id),
  pro_team_id TEXT REFERENCES pro_teams(id),
  acquired_via TEXT NOT NULL DEFAULT 'draft',
  UNIQUE(league_id, player_id),
  UNIQUE(league_id, pro_team_id)
);
CREATE TABLE IF NOT EXISTS lineups (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  member_id TEXT NOT NULL REFERENCES league_members(id),
  week INTEGER NOT NULL,
  player_id TEXT REFERENCES players(id),
  pro_team_id TEXT REFERENCES pro_teams(id),
  slot TEXT NOT NULL,
  UNIQUE(league_id, member_id, week, player_id)
);
CREATE TABLE IF NOT EXISTS weekly_squad_scores (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  week INTEGER NOT NULL,
  member_id TEXT NOT NULL REFERENCES league_members(id),
  pro_team_id TEXT NOT NULL REFERENCES pro_teams(id),
  points REAL NOT NULL DEFAULT 0,
  breakdown TEXT NOT NULL DEFAULT '{}',
  UNIQUE(league_id, week, member_id)
);
CREATE TABLE IF NOT EXISTS weekly_matchups (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  week INTEGER NOT NULL,
  member_a TEXT NOT NULL REFERENCES league_members(id),
  member_b TEXT REFERENCES league_members(id),
  score_a REAL,
  score_b REAL,
  is_playoff INTEGER NOT NULL DEFAULT 0,
  scored_at TEXT,
  UNIQUE(league_id, week, member_a)
);
CREATE TABLE IF NOT EXISTS weekly_player_scores (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  week INTEGER NOT NULL,
  member_id TEXT NOT NULL REFERENCES league_members(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  points REAL NOT NULL DEFAULT 0,
  breakdown TEXT NOT NULL DEFAULT '{}',
  UNIQUE(league_id, week, member_id, player_id)
);
CREATE TABLE IF NOT EXISTS standings (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  member_id TEXT NOT NULL REFERENCES league_members(id),
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0,
  points_for REAL NOT NULL DEFAULT 0,
  points_against REAL NOT NULL DEFAULT 0,
  updated_at TEXT,
  UNIQUE(league_id, member_id)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  league_id TEXT REFERENCES leagues(id),
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id, week);
CREATE INDEX IF NOT EXISTS idx_stats_match ON player_match_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_members_league ON league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_events_league ON events(league_id, created_at);
`;
