-- one row per submitted score
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loc TEXT NOT NULL,          -- location id, e.g. 'tofino'
  name TEXT NOT NULL,         -- 1-7 characters, A-Z and 0-9
  score INTEGER NOT NULL,
  seed INTEGER NOT NULL,      -- the round's seed: the same seed replays the same fish
  shots INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0,
  stoned INTEGER NOT NULL DEFAULT 0,
  landed INTEGER NOT NULL DEFAULT 0,
  ip TEXT NOT NULL,           -- salted hash of the sender's address, only for rate limiting
  at INTEGER NOT NULL         -- unix ms
);
CREATE INDEX IF NOT EXISTS scores_loc_score ON scores (loc, score DESC, at);
CREATE INDEX IF NOT EXISTS scores_ip_at ON scores (ip, at);
