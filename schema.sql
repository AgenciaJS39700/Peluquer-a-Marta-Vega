-- /schema.sql — Salón Marta Vega (D1 «marta-vega», binding DB)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  pass_iter INTEGER NOT NULL,
  marketing INTEGER NOT NULL DEFAULT 0,
  terms_at TEXT NOT NULL,
  ref_code TEXT NOT NULL UNIQUE,
  referred_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_attempts (k TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS attempts_k ON auth_attempts(k, ts);
CREATE TABLE IF NOT EXISTS points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS points_user ON points(user_id);
CREATE TABLE IF NOT EXISTS rewards_used (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  reward TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS gift_cards (
  code TEXT PRIMARY KEY,
  amount_c INTEGER NOT NULL,
  balance_c INTEGER NOT NULL,
  from_name TEXT NOT NULL,
  to_name TEXT NOT NULL,
  message TEXT,
  design TEXT NOT NULL,
  user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  code TEXT PRIMARY KEY,
  user_id INTEGER,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  items TEXT NOT NULL,
  total_c INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'reservado',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- v2 (30/10/2026): pagos simulados, cumpleaños, restablecer contraseña, movimientos de tarjetas regalo
ALTER TABLE users ADD COLUMN birthday TEXT;            -- MM-DD
ALTER TABLE users ADD COLUMN bday_year INTEGER;        -- último año en que recibió el regalo
ALTER TABLE gift_cards ADD COLUMN status TEXT NOT NULL DEFAULT 'pagada';
ALTER TABLE gift_cards ADD COLUMN to_email TEXT;
ALTER TABLE orders ADD COLUMN paid INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS resets (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,            -- pi_demo_…
  kind TEXT NOT NULL,             -- regalo | pedido
  ref TEXT NOT NULL,              -- código de la tarjeta o del pedido
  amount_c INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | pagado | rechazado
  last4 TEXT, brand TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS gift_txn (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, delta_c INTEGER NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
