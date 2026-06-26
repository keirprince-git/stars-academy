import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";
import type { Player, DashboardRow, User, Session, BankTransaction, BankAllocation } from "./types";

/* ── Connection (singleton) ─────────────────────────── */

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), "stars_academy.db");
let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = DELETE");
    _db.pragma("foreign_keys = ON");
    ensureSchema(_db);
    seedDefaultUsers(_db);
    seedDefaultCategories(_db);
    seedDefaultSettings(_db);
    seedDefaultTariffs(_db);
  }
  return _db;
}

/* ── Hash helper (used by seed and auth) ────────────── */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/* ── Schema ─────────────────────────────────────────── */

function ensureSchema(d: Database.Database) {
  /* ── Migration: fix old bank_transactions missing allocated_amount ── */
  try {
    const cols = d.prepare("PRAGMA table_info(bank_transactions)").all() as Array<{ name: string }>;
    if (cols.length > 0 && !cols.some(c => c.name === "allocated_amount")) {
      d.exec("DROP TABLE IF EXISTS bank_allocations");
      d.exec("DROP TABLE IF EXISTS bank_transactions");
    }
  } catch { /* table doesn't exist yet — fine */ }

  /* ── Migration: add category to bank_transactions ── */
  try {
    const cols = d.prepare("PRAGMA table_info(bank_transactions)").all() as Array<{ name: string }>;
    if (cols.length > 0 && !cols.some(c => c.name === "category")) {
      d.exec("ALTER TABLE bank_transactions ADD COLUMN category TEXT");
    }
  } catch { /* table doesn't exist yet — fine */ }

  /* ── Migration: add kind + kit_order_id to bank_allocations ──
     Lets a deposit be allocated as a kit payment, not just session fees.
     Existing rows default to kind='session', preserving current behaviour. */
  try {
    const cols = d.prepare("PRAGMA table_info(bank_allocations)").all() as Array<{ name: string }>;
    if (cols.length > 0 && !cols.some(c => c.name === "kind")) {
      d.exec("ALTER TABLE bank_allocations ADD COLUMN kind TEXT NOT NULL DEFAULT 'session'");
    }
    if (cols.length > 0 && !cols.some(c => c.name === "kit_order_id")) {
      d.exec("ALTER TABLE bank_allocations ADD COLUMN kit_order_id INTEGER");
    }
  } catch { /* table doesn't exist yet — fine */ }

  /* ── Migration: widen kit_orders status to allow 'gifted' + add gifted_at ──
     SQLite can't alter a CHECK constraint in place, so recreate the table
     (preserving data) when the existing definition predates 'gifted'. */
  try {
    const row = d.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='kit_orders'"
    ).get() as { sql: string } | undefined;
    if (row && row.sql && !row.sql.includes("'gifted'")) {
      d.exec(`
        CREATE TABLE kit_orders_new (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          kit_year      TEXT    NOT NULL,
          token         TEXT    NOT NULL UNIQUE,
          status        TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','declined','paid','gifted','collected')),
          confirmed_at  TEXT,
          paid_at       TEXT,
          gifted_at     TEXT,
          collected_at  TEXT,
          notes         TEXT,
          created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
          UNIQUE(player_id, kit_year)
        );
        INSERT INTO kit_orders_new
          (id, player_id, kit_year, token, status, confirmed_at, paid_at, collected_at, notes, created_at)
          SELECT id, player_id, kit_year, token, status, confirmed_at, paid_at, collected_at, notes, created_at
          FROM kit_orders;
        DROP TABLE kit_orders;
        ALTER TABLE kit_orders_new RENAME TO kit_orders;
        CREATE INDEX IF NOT EXISTS idx_kit_player ON kit_orders(player_id);
        CREATE INDEX IF NOT EXISTS idx_kit_token  ON kit_orders(token);
      `);
      console.log("[stars-academy] Migrated kit_orders to support 'gifted' status");
    }
  } catch { /* table doesn't exist yet — fine, CREATE TABLE handles it */ }

  /* ── Migration: add categorised_at / categorised_by to bank_transactions ── */
  try {
    const cols = d.prepare("PRAGMA table_info(bank_transactions)").all() as Array<{ name: string }>;
    if (cols.length > 0 && !cols.some(c => c.name === "categorised_at")) {
      d.exec("ALTER TABLE bank_transactions ADD COLUMN categorised_at TEXT");
    }
    if (cols.length > 0 && !cols.some(c => c.name === "categorised_by")) {
      d.exec("ALTER TABLE bank_transactions ADD COLUMN categorised_by INTEGER REFERENCES users(id)");
    }
  } catch { /* table doesn't exist yet — fine */ }

  /* ── Migration: add parent fields to players ── */
  try {
    const cols = d.prepare("PRAGMA table_info(players)").all() as Array<{ name: string }>;
    if (cols.length > 0 && !cols.some(c => c.name === "parent_name")) {
      d.exec("ALTER TABLE players ADD COLUMN parent_name TEXT");
      d.exec("ALTER TABLE players ADD COLUMN parent_phone TEXT");
    }
  } catch { /* table doesn't exist yet — fine */ }

  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'recorder'
                    CHECK (role IN ('admin','recorder')),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      token      TEXT    NOT NULL UNIQUE,
      expires_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT    NOT NULL UNIQUE,
      name         TEXT    NOT NULL,
      country      TEXT,
      source       TEXT,
      play_status  TEXT    NOT NULL DEFAULT 'Active'
                   CHECK (play_status IN ('Active','Inactive','Left')),
      scholarship  INTEGER NOT NULL DEFAULT 0,
      parent_name  TEXT,
      parent_phone TEXT,
      notes        TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id    INTEGER NOT NULL REFERENCES players(id),
      session_date TEXT    NOT NULL,
      attended     INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions_purchased (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id          INTEGER NOT NULL REFERENCES players(id),
      purchase_date      TEXT    NOT NULL,
      type               TEXT    NOT NULL DEFAULT 'Purchase'
                         CHECK (type IN ('Purchase','Adjustment','Transfer','Opening balance')),
      amount_paid        REAL    NOT NULL DEFAULT 0,
      sessions_purchased INTEGER NOT NULL DEFAULT 0,
      package            TEXT,
      bank_ref           TEXT,
      notes              TEXT,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bank_transactions (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      trans_date            TEXT    NOT NULL,
      value_date            TEXT    NOT NULL,
      description           TEXT    NOT NULL,
      reference             TEXT    NOT NULL DEFAULT '',
      deposit               REAL    NOT NULL DEFAULT 0,
      withdrawal            REAL    NOT NULL DEFAULT 0,
      balance               REAL    NOT NULL DEFAULT 0,
      status                TEXT    NOT NULL DEFAULT 'unallocated'
                            CHECK (status IN ('unallocated','partial','allocated','ignored')),
      allocated_amount      REAL    NOT NULL DEFAULT 0,
      import_batch          TEXT    NOT NULL,
      category              TEXT,
      notes                 TEXT,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bank_allocations (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_transaction_id   INTEGER NOT NULL REFERENCES bank_transactions(id),
      player_id             INTEGER NOT NULL REFERENCES players(id),
      amount                REAL    NOT NULL DEFAULT 0,
      sessions_purchased    INTEGER NOT NULL DEFAULT 0,
      package               TEXT,
      purchase_id           INTEGER REFERENCES sessions_purchased(id),
      kind                  TEXT    NOT NULL DEFAULT 'session'
                            CHECK (kind IN ('session','kit')),
      kit_order_id          INTEGER,
      notes                 TEXT,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bank_transaction_splits (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      txn_id      INTEGER NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
      category    TEXT    NOT NULL,
      amount      REAL    NOT NULL CHECK (amount > 0),
      notes       TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kit_orders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      kit_year      TEXT    NOT NULL,
      token         TEXT    NOT NULL UNIQUE,
      status        TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','declined','paid','gifted','collected')),
      confirmed_at  TEXT,
      paid_at       TEXT,
      gifted_at     TEXT,
      collected_at  TEXT,
      notes         TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(player_id, kit_year)
    );

    CREATE TABLE IF NOT EXISTS tariff_packages (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      effective_from TEXT    NOT NULL,
      label          TEXT    NOT NULL,
      sessions       INTEGER NOT NULL,
      price_upper    REAL    NOT NULL,
      price_lower    REAL    NOT NULL,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      value  TEXT    NOT NULL UNIQUE,
      label  TEXT    NOT NULL,
      type   TEXT    NOT NULL CHECK (type IN ('income','expense')),
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_att_player   ON attendance_log(player_id);
    CREATE INDEX IF NOT EXISTS idx_att_date     ON attendance_log(session_date);
    CREATE INDEX IF NOT EXISTS idx_sp_player    ON sessions_purchased(player_id);
    CREATE INDEX IF NOT EXISTS idx_bt_status    ON bank_transactions(status);
    CREATE INDEX IF NOT EXISTS idx_bt_batch     ON bank_transactions(import_batch);
    CREATE INDEX IF NOT EXISTS idx_ba_txn       ON bank_allocations(bank_transaction_id);
    CREATE INDEX IF NOT EXISTS idx_ba_player    ON bank_allocations(player_id);
    CREATE INDEX IF NOT EXISTS idx_splits_txn   ON bank_transaction_splits(txn_id);
    CREATE INDEX IF NOT EXISTS idx_kit_player   ON kit_orders(player_id);
    CREATE INDEX IF NOT EXISTS idx_kit_token    ON kit_orders(token);
  `);

  /* ── Data migration: backfill splits from legacy single-category field ─
     For every transaction with a non-null category and no existing splits,
     create a single split row equal to its deposit (income) or withdrawal
     (expense). This preserves the I&E figures exactly and lets the user
     re-open any historic transaction and break it apart later. */
  try {
    const legacy = d.prepare(`
      SELECT bt.id, bt.deposit, bt.withdrawal, bt.category
      FROM bank_transactions bt
      LEFT JOIN bank_transaction_splits s ON s.txn_id = bt.id
      WHERE bt.category IS NOT NULL AND s.id IS NULL
      GROUP BY bt.id
    `).all() as Array<{ id: number; deposit: number; withdrawal: number; category: string }>;

    if (legacy.length > 0) {
      const insertSplit = d.prepare(
        "INSERT INTO bank_transaction_splits (txn_id, category, amount) VALUES (?, ?, ?)"
      );
      const stamp = d.prepare(
        "UPDATE bank_transactions SET categorised_at = datetime('now') WHERE id = ?"
      );
      const tx = d.transaction((rows: typeof legacy) => {
        for (const r of rows) {
          const amount = r.deposit > 0 ? r.deposit : r.withdrawal;
          if (amount > 0) {
            insertSplit.run(r.id, r.category, amount);
            stamp.run(r.id);
          }
        }
      });
      tx(legacy);
      console.log(`[stars-academy] Backfilled ${legacy.length} expense splits from legacy categories`);
    }
  } catch (e) {
    console.warn("[stars-academy] Split backfill skipped:", e);
  }
}

/* ── Seed default users if table is empty ───────────── */

function seedDefaultUsers(d: Database.Database) {
  const count = d.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
  if (count.c > 0) return; // already seeded

  const insert = d.prepare(
    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
  );
  insert.run("admin", hashPassword("stars2026"), "admin");
  insert.run("recorder", hashPassword("recorder2026"), "recorder");
  console.log("[stars-academy] Created default users: admin, recorder");
}

/* ── Seed default categories if table is empty ─────── */

const DEFAULT_CATEGORIES = [
  { value: "session_fees",  label: "Session fees",      type: "income",  sort: 1 },
  { value: "kit_sales",     label: "Kit sales",         type: "income",  sort: 2 },
  { value: "camp_fees",     label: "Camp fees",         type: "income",  sort: 3 },
  { value: "other_income",  label: "Other income",      type: "income",  sort: 4 },
  { value: "coaching_fees", label: "Coaching fees",     type: "expense", sort: 10 },
  { value: "pitch_hire",    label: "Pitch / venue hire", type: "expense", sort: 11 },
  { value: "equipment_kit", label: "Equipment & kit",   type: "expense", sort: 12 },
  { value: "bank_charges",  label: "Bank charges",      type: "expense", sort: 13 },
  { value: "stamp_duty",    label: "Stamp duty",        type: "expense", sort: 14 },
  { value: "drawings",      label: "Drawings",          type: "expense", sort: 15 },
  { value: "insurance",     label: "Insurance",         type: "expense", sort: 16 },
  { value: "salaries",      label: "Salaries",          type: "expense", sort: 17 },
  { value: "setup_costs",   label: "Set-up costs",      type: "expense", sort: 18 },
  { value: "other_expense", label: "Other expense",     type: "expense", sort: 19 },
];

function seedDefaultCategories(d: Database.Database) {
  const count = d.prepare("SELECT COUNT(*) as c FROM categories").get() as { c: number };
  if (count.c > 0) return;

  const insert = d.prepare(
    "INSERT INTO categories (value, label, type, sort_order) VALUES (?, ?, ?, ?)"
  );
  for (const cat of DEFAULT_CATEGORIES) {
    insert.run(cat.value, cat.label, cat.type, cat.sort);
  }
  console.log("[stars-academy] Seeded default categories");
}

/* ── Category queries ──────────────────────────────── */

export interface CategoryRow {
  id: number;
  value: string;
  label: string;
  type: "income" | "expense";
  sort_order: number;
}

export function getCategories(): CategoryRow[] {
  return db()
    .prepare("SELECT * FROM categories ORDER BY type, sort_order")
    .all() as CategoryRow[];
}

export function addCategory(value: string, label: string, type: "income" | "expense") {
  const maxSort = db()
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM categories WHERE type = ?")
    .get(type) as { next: number };
  db()
    .prepare("INSERT INTO categories (value, label, type, sort_order) VALUES (?, ?, ?, ?)")
    .run(value, label, type, maxSort.next);
}

export function updateCategory(id: number, label: string, type: "income" | "expense") {
  db()
    .prepare("UPDATE categories SET label = ?, type = ? WHERE id = ?")
    .run(label, type, id);
}

export function deleteCategory(id: number) {
  // Clear category from any transactions using it
  const cat = db().prepare("SELECT value FROM categories WHERE id = ?").get(id) as { value: string } | undefined;
  if (cat) {
    db().prepare("UPDATE bank_transactions SET category = NULL WHERE category = ?").run(cat.value);
  }
  db().prepare("DELETE FROM categories WHERE id = ?").run(id);
}

/* ── Tariff management ────────────────────────────── */

const DEFAULT_TARIFFS = [
  { label: "One session",     sessions: 1,  price_upper: 12000, price_lower: 12000, sort: 1 },
  { label: "Four sessions",   sessions: 4,  price_upper: 35000, price_lower: 30000, sort: 2 },
  { label: "Eight sessions",  sessions: 8,  price_upper: 50000, price_lower: 45000, sort: 3 },
  { label: "Twelve sessions", sessions: 12, price_upper: 60000, price_lower: 60000, sort: 4 },
];

function seedDefaultTariffs(d: Database.Database) {
  const count = d.prepare("SELECT COUNT(*) as c FROM tariff_packages").get() as { c: number };
  if (count.c > 0) return;

  const insert = d.prepare(
    `INSERT INTO tariff_packages (effective_from, label, sessions, price_upper, price_lower, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const t of DEFAULT_TARIFFS) {
    insert.run("2026-01-01", t.label, t.sessions, t.price_upper, t.price_lower, t.sort);
  }
  console.log("[stars-academy] Seeded default tariff packages (effective 2026-01-01)");
}

export interface TariffRow {
  id: number;
  effective_from: string;
  label: string;
  sessions: number;
  price_upper: number;
  price_lower: number;
  sort_order: number;
}

/** Get all distinct effective dates (most recent first) */
export function getTariffDates(): string[] {
  return (db()
    .prepare("SELECT DISTINCT effective_from FROM tariff_packages ORDER BY effective_from DESC")
    .all() as Array<{ effective_from: string }>)
    .map(r => r.effective_from);
}

/** Get packages for a specific effective date */
export function getTariffPackages(effectiveFrom: string): TariffRow[] {
  return db()
    .prepare("SELECT * FROM tariff_packages WHERE effective_from = ? ORDER BY sort_order")
    .all(effectiveFrom) as TariffRow[];
}

/** Get the current tariff (most recent effective_from <= today) */
export function getCurrentTariffDate(): string | null {
  const row = db()
    .prepare(
      `SELECT effective_from FROM tariff_packages
       WHERE effective_from <= date('now')
       ORDER BY effective_from DESC LIMIT 1`
    )
    .get() as { effective_from: string } | undefined;
  return row?.effective_from ?? null;
}

/** Get all tariff packages (all dates, for admin view) */
export function getAllTariffPackages(): TariffRow[] {
  return db()
    .prepare("SELECT * FROM tariff_packages ORDER BY effective_from DESC, sort_order")
    .all() as TariffRow[];
}

export function addTariffPackage(
  effectiveFrom: string,
  label: string,
  sessions: number,
  priceUpper: number,
  priceLower: number,
) {
  const maxSort = db()
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM tariff_packages WHERE effective_from = ?")
    .get(effectiveFrom) as { next: number };
  db()
    .prepare(
      `INSERT INTO tariff_packages (effective_from, label, sessions, price_upper, price_lower, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(effectiveFrom, label, sessions, priceUpper, priceLower, maxSort.next);
}

export function updateTariffPackage(
  id: number,
  label: string,
  sessions: number,
  priceUpper: number,
  priceLower: number,
) {
  db()
    .prepare(
      `UPDATE tariff_packages SET label = ?, sessions = ?, price_upper = ?, price_lower = ? WHERE id = ?`
    )
    .run(label, sessions, priceUpper, priceLower, id);
}

export function deleteTariffPackage(id: number) {
  db().prepare("DELETE FROM tariff_packages WHERE id = ?").run(id);
}

/** Copy an entire tariff set to a new effective date */
export function copyTariffSet(fromDate: string, toDate: string) {
  const existing = getTariffPackages(fromDate);
  const insert = db().prepare(
    `INSERT INTO tariff_packages (effective_from, label, sessions, price_upper, price_lower, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const tx = db().transaction(() => {
    for (const pkg of existing) {
      insert.run(toDate, pkg.label, pkg.sessions, pkg.price_upper, pkg.price_lower, pkg.sort_order);
    }
  });
  tx();
}

/* ── Settings ──────────────────────────────────────── */

const DEFAULT_SETTINGS: Record<string, string> = {
  bank_name: "The Stars Football Academy",
  bank_bank: "Taj Bank",
  bank_account: "0010270588",
  coach_phone: "080 7077 7069",
  chase_template: [
    "I hope you're well. This is a reminder regarding {{player}}'s sessions at Stars Football Academy.",
    "",
    "{{balance_line}}",
    "",
    "Please make a payment to:",
    "Account Name: {{bank_name}}",
    "Bank: {{bank_bank}}",
    "Account Number: {{bank_account}}",
    "",
    "Please send confirmation of payment to Coach Sunny on {{coach_phone}}.",
    "",
    "Thank you!",
  ].join("\n"),
};

function seedDefaultSettings(d: Database.Database) {
  const count = d.prepare("SELECT COUNT(*) as c FROM settings").get() as { c: number };
  if (count.c > 0) return;

  const insert = d.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insert.run(key, value);
  }
  console.log("[stars-academy] Seeded default settings");
}

export function getSetting(key: string): string | null {
  const row = db()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? DEFAULT_SETTINGS[key] ?? null;
}

export function getAllSettings(): Record<string, string> {
  const rows = db()
    .prepare("SELECT key, value FROM settings")
    .all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function setSetting(key: string, value: string) {
  db()
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run(key, value);
}

/* ── Player queries ─────────────────────────────────── */

export function getPlayers(opts?: {
  status?: string;
  scholarship?: string;
  search?: string;
  sort?: string;
  dir?: string;
}): Player[] {
  const clauses: string[] = ["1=1"];
  const params: Record<string, string> = {};

  if (opts?.status && opts.status !== "all") {
    clauses.push("play_status = @status");
    params.status = opts.status;
  }
  if (opts?.scholarship === "yes") {
    clauses.push("scholarship = 1");
  } else if (opts?.scholarship === "no") {
    clauses.push("scholarship = 0");
  }
  if (opts?.search) {
    clauses.push("(name LIKE @search OR code LIKE @search)");
    params.search = `%${opts.search}%`;
  }

  const validSorts = ["code", "name", "play_status", "country"];
  const sort = validSorts.includes(opts?.sort ?? "") ? opts!.sort : "code";
  const dir = opts?.dir === "desc" ? "DESC" : "ASC";

  const sql = `SELECT * FROM players WHERE ${clauses.join(" AND ")} ORDER BY ${sort} ${dir}`;
  return db().prepare(sql).all(params) as Player[];
}

export function getPlayer(id: number): Player | undefined {
  return db().prepare("SELECT * FROM players WHERE id = ?").get(id) as Player | undefined;
}

export function updatePlayer(
  id: number,
  data: Partial<Pick<Player, "name" | "country" | "source" | "play_status" | "scholarship" | "parent_name" | "parent_phone" | "notes">>
) {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      sets.push(`${k} = @${k}`);
      params[k] = v;
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  db().prepare(`UPDATE players SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

export function createPlayer(data: {
  code: string;
  name: string;
  country?: string;
  source?: string;
  play_status?: string;
  scholarship?: number;
  notes?: string;
}): number {
  const result = db()
    .prepare(
      `INSERT INTO players (code, name, country, source, play_status, scholarship, notes)
       VALUES (@code, @name, @country, @source, @play_status, @scholarship, @notes)`
    )
    .run({
      code: data.code,
      name: data.name,
      country: data.country ?? null,
      source: data.source ?? null,
      play_status: data.play_status ?? "Active",
      scholarship: data.scholarship ?? 0,
      notes: data.notes ?? null,
    });
  return result.lastInsertRowid as number;
}

export function nextPlayerCode(): string {
  const row = db()
    .prepare("SELECT code FROM players ORDER BY CAST(SUBSTR(code,2) AS INTEGER) DESC LIMIT 1")
    .get() as { code: string } | undefined;
  if (!row) return "P001";
  const num = parseInt(row.code.slice(1), 10) + 1;
  return `P${String(num).padStart(3, "0")}`;
}

/* ── Dashboard query ────────────────────────────────── */

export function getDashboard(opts?: {
  status?: string;
  payStatus?: string;
  search?: string;
}): DashboardRow[] {
  let sql = `
    SELECT
      p.id        AS player_id,
      p.code,
      p.name,
      COALESCE(sp.total_sessions, 0)   AS sessions_paid,
      COALESCE(att.total_attended, 0)  AS sessions_attended,
      COALESCE(sp.total_sessions, 0) - COALESCE(att.total_attended, 0) AS balance,
      CASE
        WHEN p.scholarship = 1 THEN 'Scholarship'
        WHEN COALESCE(sp.total_sessions, 0) - COALESCE(att.total_attended, 0) < 0 THEN 'OVERDUE'
        WHEN COALESCE(sp.total_sessions, 0) - COALESCE(att.total_attended, 0) = 0 THEN 'Fully used'
        ELSE 'Credit'
      END AS pay_status,
      p.play_status,
      p.scholarship,
      p.notes
    FROM players p
    LEFT JOIN (
      SELECT player_id, SUM(sessions_purchased) AS total_sessions
      FROM sessions_purchased GROUP BY player_id
    ) sp ON sp.player_id = p.id
    LEFT JOIN (
      SELECT player_id, COUNT(*) AS total_attended
      FROM attendance_log WHERE attended = 1 GROUP BY player_id
    ) att ON att.player_id = p.id
  `;

  const clauses: string[] = [];
  const params: Record<string, string> = {};

  if (opts?.status && opts.status !== "all") {
    clauses.push("p.play_status = @status");
    params.status = opts.status;
  }
  if (opts?.search) {
    clauses.push("(p.name LIKE @search OR p.code LIKE @search)");
    params.search = `%${opts.search}%`;
  }

  if (clauses.length > 0) {
    sql += " WHERE " + clauses.join(" AND ");
  }

  sql += " ORDER BY p.code ASC";

  let rows = db().prepare(sql).all(params) as DashboardRow[];

  // Post-filter pay status (since it's computed)
  if (opts?.payStatus && opts.payStatus !== "all") {
    rows = rows.filter((r) => r.pay_status === opts.payStatus);
  }

  return rows;
}

/* ── Summary stats ──────────────────────────────────── */

export function getDashboardSummary() {
  const rows = getDashboard();
  const total = rows.length;
  const active = rows.filter((r) => r.play_status === "Active").length;
  const overdue = rows.filter((r) => r.pay_status === "OVERDUE").length;
  const scholarship = rows.filter((r) => r.scholarship === 1).length;
  const credit = rows.filter((r) => r.pay_status === "Credit").length;
  return { total, active, overdue, scholarship, credit };
}

/* ── Auth queries ───────────────────────────────────── */

export function getUserByUsername(username: string): User | undefined {
  return db()
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username) as User | undefined;
}

export function createSession(userId: number, token: string, expiresAt: string) {
  db()
    .prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)")
    .run(userId, token, expiresAt);
}

export function getSessionByToken(token: string): (Session & { role: User["role"]; username: string }) | undefined {
  return db()
    .prepare(
      `SELECT s.*, u.role, u.username
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(token) as (Session & { role: "admin" | "recorder"; username: string }) | undefined;
}

export function deleteSession(token: string) {
  db().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function deleteExpiredSessions() {
  db().prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

/* ── User management ────────────────────────────────── */

export function getAllUsers(): Array<{ id: number; username: string; role: 'admin' | 'recorder'; created_at: string }> {
  return db()
    .prepare("SELECT id, username, role, created_at FROM users ORDER BY username")
    .all() as Array<{ id: number; username: string; role: 'admin' | 'recorder'; created_at: string }>;
}

export function getUserById(id: number): User | undefined {
  return db().prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function countAdmins(): number {
  return (db().prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get() as { c: number }).c;
}

export function addUser(username: string, password: string, role: 'admin' | 'recorder'): number {
  const result = db()
    .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)")
    .run(username, hashPassword(password), role);
  return Number(result.lastInsertRowid);
}

export function updateUser(id: number, username: string, role: 'admin' | 'recorder') {
  db().prepare("UPDATE users SET username = ?, role = ? WHERE id = ?").run(username, role, id);
}

/**
 * Reset a user's password. Invalidates all sessions for that user, except the
 * one identified by keepToken (used when a user changes their own password
 * and we want to keep them logged in on the current device).
 */
export function setUserPassword(userId: number, password: string, keepToken: string | null = null) {
  db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), userId);
  if (keepToken) {
    db().prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(userId, keepToken);
  } else {
    db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }
}

export function deleteUser(id: number) {
  db().prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  db().prepare("DELETE FROM users WHERE id = ?").run(id);
}

/* ── Player detail queries ──────────────────────────── */

export function getPlayerAttendance(playerId: number, limit?: number) {
  const sql = limit
    ? `SELECT session_date, attended FROM attendance_log
       WHERE player_id = ? ORDER BY session_date DESC LIMIT ?`
    : `SELECT session_date, attended FROM attendance_log
       WHERE player_id = ? ORDER BY session_date DESC`;
  const args: (number)[] = limit ? [playerId, limit] : [playerId];
  return db().prepare(sql).all(...args) as { session_date: string; attended: number }[];
}

export function getPlayerAttendanceStats(playerId: number) {
  // Count attended sessions from the log
  const attended = db()
    .prepare(
      `SELECT COUNT(*) AS c FROM attendance_log WHERE player_id = ? AND attended = 1`
    )
    .get(playerId) as { c: number };

  // Count all sessions since the player's first attendance record
  // This includes sessions where the player has no record (absent, not in roster)
  const firstDate = db()
    .prepare(
      `SELECT MIN(session_date) AS d FROM attendance_log WHERE player_id = ?`
    )
    .get(playerId) as { d: string | null };

  let total = 0;
  if (firstDate.d) {
    const allSessions = db()
      .prepare(
        `SELECT COUNT(DISTINCT session_date) AS c
         FROM attendance_log WHERE session_date >= ?`
      )
      .get(firstDate.d) as { c: number };
    total = allSessions.c;
  }

  return { total, attended: attended.c };
}

/* ── Attendance recording ────────────────────────────── */

export function getActivePlayers() {
  return db()
    .prepare("SELECT id, code, name FROM players WHERE play_status = 'Active' ORDER BY name ASC")
    .all() as { id: number; code: string; name: string }[];
}

export function recordAttendance(sessionDate: string, sessionDay: string, attendedPlayerIds: number[]) {
  const activePlayers = getActivePlayers();
  const attendedSet = new Set(attendedPlayerIds);

  const insert = db().prepare(
    "INSERT INTO attendance_log (player_id, session_date, attended) VALUES (?, ?, ?)"
  );

  const tx = db().transaction(() => {
    // Delete any existing records for this date to allow re-submission
    db().prepare("DELETE FROM attendance_log WHERE session_date = ?").run(sessionDate);

    for (const player of activePlayers) {
      insert.run(player.id, sessionDate, attendedSet.has(player.id) ? 1 : 0);
    }
  });

  tx();
}

export function getRecentSessions(limit = 20) {
  return db()
    .prepare(
      `SELECT session_date, COUNT(CASE WHEN attended=1 THEN 1 END) AS attended_count,
              COUNT(*) AS total_count
       FROM attendance_log
       GROUP BY session_date
       ORDER BY session_date DESC
       LIMIT ?`
    )
    .all(limit) as { session_date: string; attended_count: number; total_count: number }[];
}

export function getSessionAttendance(sessionDate: string) {
  return db()
    .prepare(
      `SELECT al.player_id, p.code, p.name, al.attended
       FROM attendance_log al
       JOIN players p ON p.id = al.player_id
       WHERE al.session_date = ?
       ORDER BY p.name ASC`
    )
    .all(sessionDate) as { player_id: number; code: string; name: string; attended: number }[];
}

export function getPlayerPurchases(playerId: number) {
  return db()
    .prepare(
      `SELECT purchase_date, type, amount_paid, sessions_purchased, package, bank_ref, notes
       FROM sessions_purchased
       WHERE player_id = ? ORDER BY purchase_date DESC`
    )
    .all(playerId) as {
    purchase_date: string;
    type: string;
    amount_paid: number;
    sessions_purchased: number;
    package: string | null;
    bank_ref: string | null;
    notes: string | null;
  }[];
}

export function addFreeSessionCredit(
  playerId: number,
  sessions: number,
  notes: string | null,
) {
  const today = new Date().toISOString().slice(0, 10);
  return db()
    .prepare(
      `INSERT INTO sessions_purchased
         (player_id, purchase_date, type, amount_paid, sessions_purchased, package, notes)
       VALUES (?, ?, 'Adjustment', 0, ?, 'Free session', ?)`
    )
    .run(playerId, today, sessions, notes);
}

export function transferSessions(
  fromPlayerId: number,
  toPlayerId: number,
  sessions: number,
  notes: string | null,
) {
  const today = new Date().toISOString().slice(0, 10);
  const d = db();

  const insert = d.prepare(
    `INSERT INTO sessions_purchased
       (player_id, purchase_date, type, amount_paid, sessions_purchased, package, notes)
     VALUES (?, ?, 'Transfer', 0, ?, 'Transfer', ?)`
  );

  const fromName = (d.prepare("SELECT name FROM players WHERE id = ?").get(fromPlayerId) as { name: string })?.name ?? `P${fromPlayerId}`;
  const toName = (d.prepare("SELECT name FROM players WHERE id = ?").get(toPlayerId) as { name: string })?.name ?? `P${toPlayerId}`;

  const tx = d.transaction(() => {
    insert.run(fromPlayerId, today, -sessions, notes ? `To ${toName}: ${notes}` : `To ${toName}`);
    insert.run(toPlayerId, today, sessions, notes ? `From ${fromName}: ${notes}` : `From ${fromName}`);
  });

  tx();
}

export function getPlayerBankAllocations(playerId: number) {
  return db()
    .prepare(
      `SELECT ba.id, ba.amount, ba.sessions_purchased, ba.package, ba.notes,
              ba.created_at,
              bt.id AS txn_id, bt.trans_date, bt.description, bt.reference
       FROM bank_allocations ba
       JOIN bank_transactions bt ON bt.id = ba.bank_transaction_id
       WHERE ba.player_id = ?
       ORDER BY bt.trans_date DESC`
    )
    .all(playerId) as {
    id: number;
    amount: number;
    sessions_purchased: number;
    package: string | null;
    notes: string | null;
    created_at: string;
    txn_id: number;
    trans_date: string;
    description: string;
    reference: string;
  }[];
}

/* ── Bank transaction queries ──────────────────────── */

export function insertBankTransactions(
  rows: Array<{
    trans_date: string;
    value_date: string;
    description: string;
    reference: string;
    deposit: number;
    withdrawal: number;
    balance: number;
  }>,
  importBatch: string
): number {
  const insert = db().prepare(
    `INSERT INTO bank_transactions
       (trans_date, value_date, description, reference, deposit, withdrawal, balance, import_batch)
     VALUES (@trans_date, @value_date, @description, @reference, @deposit, @withdrawal, @balance, @import_batch)`
  );

  const tx = db().transaction(() => {
    for (const r of rows) {
      insert.run({ ...r, import_batch: importBatch });
    }
  });

  tx();
  return rows.length;
}

export function getBankTransactions(opts?: {
  status?: string;
  search?: string;
  batch?: string;
}): BankTransaction[] {
  const clauses: string[] = ["1=1"];
  const params: Record<string, string> = {};

  if (opts?.status && opts.status !== "all") {
    if (opts.status === "unallocated") {
      // Include both unallocated and partial
      clauses.push("(bt.status = 'unallocated' OR bt.status = 'partial')");
    } else {
      clauses.push("bt.status = @status");
      params.status = opts.status;
    }
  }
  if (opts?.search) {
    clauses.push("(bt.description LIKE @search OR bt.reference LIKE @search)");
    params.search = `%${opts.search}%`;
  }
  if (opts?.batch) {
    clauses.push("bt.import_batch = @batch");
    params.batch = opts.batch;
  }

  return db()
    .prepare(
      `SELECT bt.*
       FROM bank_transactions bt
       WHERE ${clauses.join(" AND ")}
       ORDER BY bt.trans_date DESC, bt.id DESC`
    )
    .all(params) as BankTransaction[];
}

export function getBankTransaction(id: number): BankTransaction | undefined {
  return db()
    .prepare("SELECT * FROM bank_transactions WHERE id = ?")
    .get(id) as BankTransaction | undefined;
}

export function getBankAllocations(txnId: number) {
  return db()
    .prepare(
      `SELECT ba.*, p.name AS player_name, p.code AS player_code
       FROM bank_allocations ba
       JOIN players p ON p.id = ba.player_id
       WHERE ba.bank_transaction_id = ?
       ORDER BY ba.created_at ASC`
    )
    .all(txnId) as (BankAllocation & { player_name: string; player_code: string })[];
}

/** Recalculate allocated_amount and status after adding/removing allocations */
function refreshTxnStatus(d: Database.Database, txnId: number) {
  const txn = d.prepare("SELECT deposit FROM bank_transactions WHERE id = ?").get(txnId) as { deposit: number };
  const sum = d.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM bank_allocations WHERE bank_transaction_id = ?"
  ).get(txnId) as { total: number };

  let status: string;
  if (sum.total <= 0) {
    status = "unallocated";
  } else if (sum.total >= txn.deposit) {
    status = "allocated";
  } else {
    status = "partial";
  }

  d.prepare(
    "UPDATE bank_transactions SET status = ?, allocated_amount = ? WHERE id = ?"
  ).run(status, sum.total, txnId);
}

export function addBankAllocation(
  txnId: number,
  playerId: number,
  amount: number,
  sessionsPurchased: number,
  packageName: string | null,
  notes: string | null
) {
  const txn = getBankTransaction(txnId);
  if (!txn) throw new Error("Transaction not found");
  if (txn.status === "allocated" || txn.status === "ignored") {
    throw new Error("Transaction is already fully allocated or ignored");
  }

  const d = db();
  const tx = d.transaction(() => {
    // Create the sessions_purchased record
    const purchaseResult = d
      .prepare(
        `INSERT INTO sessions_purchased
           (player_id, purchase_date, type, amount_paid, sessions_purchased, package, bank_ref, notes)
         VALUES (?, ?, 'Purchase', ?, ?, ?, ?, ?)`
      )
      .run(
        playerId,
        txn.trans_date,
        amount,
        sessionsPurchased,
        packageName,
        txn.reference || null,
        notes
      );

    // Create the bank allocation record
    d.prepare(
      `INSERT INTO bank_allocations
         (bank_transaction_id, player_id, amount, sessions_purchased, package, purchase_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(txnId, playerId, amount, sessionsPurchased, packageName, purchaseResult.lastInsertRowid, notes);

    // Recalculate status
    refreshTxnStatus(d, txnId);
  });

  tx();
}

/**
 * Record a kit payment: links a bank deposit to a player's kit order, marks
 * that kit order as paid, and counts the amount as Kit sales income (rather
 * than session_fees) in the Accounts.
 */
export function addBankKitPayment(
  txnId: number,
  playerId: number,
  amount: number,
  kitOrderId: number,
  notes: string | null,
) {
  const txn = getBankTransaction(txnId);
  if (!txn) throw new Error("Transaction not found");
  if (txn.status === "allocated" || txn.status === "ignored") {
    throw new Error("Transaction is already fully allocated or ignored");
  }

  const d = db();
  const tx = d.transaction(() => {
    // Kit allocation row — no sessions_purchased created (no session credit).
    d.prepare(
      `INSERT INTO bank_allocations
         (bank_transaction_id, player_id, amount, sessions_purchased, package, purchase_id, kind, kit_order_id, notes)
       VALUES (?, ?, ?, 0, 'Kit', NULL, 'kit', ?, ?)`
    ).run(txnId, playerId, amount, kitOrderId, notes);

    // Move the kit order to 'paid' (sets paid_at, clears any gifted_at, fills confirmed_at if not set).
    setKitOrderStatus(kitOrderId, 'paid');

    // Refresh the parent transaction's status
    refreshTxnStatus(d, txnId);
  });

  tx();
}

export function removeBankAllocation(allocationId: number) {
  const d = db();
  const alloc = d.prepare("SELECT * FROM bank_allocations WHERE id = ?").get(allocationId) as BankAllocation & { kind?: string; kit_order_id?: number | null } | undefined;
  if (!alloc) throw new Error("Allocation not found");

  const tx = d.transaction(() => {
    // Delete the allocation FIRST — it has a FK to sessions_purchased(id)
    // via purchase_id, so the linked purchase row can't go until the
    // allocation that references it is gone (foreign_keys = ON enforces this).
    d.prepare("DELETE FROM bank_allocations WHERE id = ?").run(allocationId);
    if (alloc.purchase_id) {
      d.prepare("DELETE FROM sessions_purchased WHERE id = ?").run(alloc.purchase_id);
    }
    // If this was a kit payment, revert the linked kit order back to 'confirmed'
    // (it must have been confirmed to be paid; admin can fully reset in /kit if needed).
    if (alloc.kind === 'kit' && alloc.kit_order_id) {
      setKitOrderStatus(alloc.kit_order_id, 'confirmed');
    }
    // Recalculate the parent transaction's status (unallocated / partial / allocated)
    refreshTxnStatus(d, alloc.bank_transaction_id);
  });

  tx();
}

export function ignoreBankTransaction(txnId: number, reason: string | null) {
  db()
    .prepare("UPDATE bank_transactions SET status = 'ignored', notes = ? WHERE id = ?")
    .run(reason, txnId);
}

/**
 * Hard-delete a bank transaction. Refuses if it has player allocations or
 * expense splits attached — those must be removed first, so deleting can
 * never silently orphan a player session purchase or a categorisation.
 */
export function deleteBankTransaction(txnId: number) {
  const d = db();
  const allocCount = (d.prepare(
    "SELECT COUNT(*) AS c FROM bank_allocations WHERE bank_transaction_id = ?"
  ).get(txnId) as { c: number }).c;
  const splitCount = (d.prepare(
    "SELECT COUNT(*) AS c FROM bank_transaction_splits WHERE txn_id = ?"
  ).get(txnId) as { c: number }).c;

  if (allocCount > 0 || splitCount > 0) {
    throw new Error(
      "Cannot delete a transaction that has player allocations or expense splits. Remove those first."
    );
  }
  d.prepare("DELETE FROM bank_transactions WHERE id = ?").run(txnId);
}

/**
 * Preview a bulk purge of one import batch up to a cutoff date. Returns how many
 * rows would be deleted (unattached: no player allocations, no category splits)
 * and which would be skipped because they ARE attached — so nothing with player
 * history or accounts impact is ever removed. Read-only.
 */
export function previewBatchPurge(batch: string, cutoff: string) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const rows = db()
    .prepare(
      `SELECT bt.id, bt.trans_date, bt.description, bt.deposit, bt.withdrawal,
              (SELECT COUNT(*) FROM bank_allocations ba WHERE ba.bank_transaction_id = bt.id) AS alloc,
              (SELECT COUNT(*) FROM bank_transaction_splits s WHERE s.txn_id = bt.id) AS splits
       FROM bank_transactions bt
       WHERE bt.import_batch = @batch AND bt.trans_date <= @cutoff
       ORDER BY bt.trans_date ASC, bt.id ASC`
    )
    .all({ batch, cutoff }) as Array<{
      id: number;
      trans_date: string;
      description: string;
      deposit: number;
      withdrawal: number;
      alloc: number;
      splits: number;
    }>;

  const deletable = rows.filter((r) => r.alloc === 0 && r.splits === 0);
  const skipped = rows
    .filter((r) => r.alloc > 0 || r.splits > 0)
    .map((r) => ({
      id: r.id,
      trans_date: r.trans_date,
      description: r.description,
      reason: r.alloc > 0 ? "allocated to a player" : "has a category split",
    }));

  return {
    batch,
    cutoff,
    totalInRange: rows.length,
    deletableCount: deletable.length,
    skippedCount: skipped.length,
    removeDeposits: round2(deletable.reduce((s, r) => s + r.deposit, 0)),
    removeWithdrawals: round2(deletable.reduce((s, r) => s + r.withdrawal, 0)),
    skipped,
  };
}

/**
 * Permanently delete the unattached rows (no allocations, no splits) of one
 * import batch dated on or before the cutoff. Mirrors deleteBankTransaction's
 * guard, applied in bulk inside a transaction. Returns the number deleted.
 */
export function purgeUnattachedInBatch(batch: string, cutoff: string): number {
  const d = db();
  const ids = d
    .prepare(
      `SELECT bt.id FROM bank_transactions bt
       WHERE bt.import_batch = @batch AND bt.trans_date <= @cutoff
         AND NOT EXISTS (SELECT 1 FROM bank_allocations ba WHERE ba.bank_transaction_id = bt.id)
         AND NOT EXISTS (SELECT 1 FROM bank_transaction_splits s WHERE s.txn_id = bt.id)`
    )
    .all({ batch, cutoff }) as Array<{ id: number }>;

  const del = d.prepare("DELETE FROM bank_transactions WHERE id = ?");
  const tx = d.transaction((rows: Array<{ id: number }>) => {
    for (const r of rows) del.run(r.id);
  });
  tx(ids);
  return ids.length;
}

export function restoreBankTransaction(txnId: number) {
  const d = db();
  const tx = d.transaction(() => {
    // Check if there are existing allocations
    const allocCount = d.prepare(
      "SELECT COUNT(*) AS c FROM bank_allocations WHERE bank_transaction_id = ?"
    ).get(txnId) as { c: number };

    if (allocCount.c > 0) {
      refreshTxnStatus(d, txnId);
    } else {
      d.prepare(
        "UPDATE bank_transactions SET status = 'unallocated', allocated_amount = 0, notes = NULL WHERE id = ?"
      ).run(txnId);
    }
  });
  tx();
}

export function getBankTransactionSummary() {
  const row = db()
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN status='unallocated' OR status='partial' THEN 1 END) AS unallocated,
         COUNT(CASE WHEN status='allocated' THEN 1 END) AS allocated,
         COUNT(CASE WHEN status='ignored'
                AND EXISTS (SELECT 1 FROM bank_transaction_splits s WHERE s.txn_id = bank_transactions.id)
               THEN 1 END) AS categorised,
         COUNT(CASE WHEN status='ignored'
                AND NOT EXISTS (SELECT 1 FROM bank_transaction_splits s WHERE s.txn_id = bank_transactions.id)
               THEN 1 END) AS ignored,
         COALESCE(SUM(CASE WHEN (status='unallocated' OR status='partial') AND deposit > 0 THEN deposit - allocated_amount END), 0) AS unallocated_amount,
         COALESCE(SUM(allocated_amount), 0) AS total_allocated_amount
       FROM bank_transactions`
    )
    .get() as {
    total: number;
    unallocated: number;
    allocated: number;
    categorised: number;
    ignored: number;
    unallocated_amount: number;
    total_allocated_amount: number;
  };

  // Latest balance from the most recent transaction
  const latest = db()
    .prepare(
      `SELECT balance, trans_date FROM bank_transactions
       ORDER BY trans_date DESC, id DESC LIMIT 1`
    )
    .get() as { balance: number; trans_date: string } | undefined;

  return {
    ...row,
    latest_balance: latest?.balance ?? null,
    latest_date: latest?.trans_date ?? null,
  };
}

/**
 * Bank statement reconciliation. Checks that the running balance printed on the
 * imported statements forms one unbroken chain: the latest balance should equal
 * the opening balance of the imported history plus the net of every deposit and
 * withdrawal.
 *
 * Works purely off the stored `balance` column (the bank's own running balance,
 * which the parser treats as source of truth). Breaks are localised per date,
 * with same-day movements netted so intra-day rows stored out of posting order
 * don't raise false flags. What remains is a balance jump unexplained by any
 * transaction — the signature of a missing statement, a duplicated import, or a
 * deleted/misread row. The per-break gaps sum to the headline discrepancy.
 */
export function getBankReconciliation() {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const rows = db()
    .prepare(
      `SELECT id, trans_date, deposit, withdrawal, balance
       FROM bank_transactions
       ORDER BY trans_date ASC, id ASC`
    )
    .all() as Array<{
      id: number;
      trans_date: string;
      deposit: number;
      withdrawal: number;
      balance: number;
    }>;

  if (rows.length === 0) {
    return {
      hasData: false,
      reconciled: true,
      anchorBalance: 0,
      anchorDate: "",
      expectedLatest: 0,
      actualLatest: 0,
      actualDate: "",
      discrepancy: 0,
      breaks: [] as Array<{ date: string; expected: number; actual: number; gap: number }>,
    };
  }

  // Opening balance of the imported history = balance just before the first row.
  const first = rows[0];
  const anchorBalance = round2(first.balance - (first.deposit - first.withdrawal));
  const anchorDate = first.trans_date;

  // Latest row matches the "Bank balance" chip (max trans_date, then max id).
  const last = rows[rows.length - 1];
  const actualLatest = last.balance;
  const actualDate = last.trans_date;

  const netMovement = round2(
    rows.reduce((s, r) => s + (r.deposit - r.withdrawal), 0)
  );
  const expectedLatest = round2(anchorBalance + netMovement);
  const discrepancy = round2(actualLatest - expectedLatest);

  // Collapse to one entry per date. Rows are id-ascending within a date, so the
  // last row of each date carries that date's closing balance.
  const days: Array<{ date: string; movement: number; close: number }> = [];
  for (let i = 0; i < rows.length; ) {
    const date = rows[i].trans_date;
    let movement = 0;
    let close = rows[i].balance;
    let j = i;
    while (j < rows.length && rows[j].trans_date === date) {
      movement += rows[j].deposit - rows[j].withdrawal;
      close = rows[j].balance;
      j++;
    }
    days.push({ date, movement: round2(movement), close });
    i = j;
  }

  // Walk the daily chain, re-baselining to each day's stated closing balance so a
  // single gap surfaces as a single break rather than cascading down the chain.
  const breaks: Array<{ date: string; expected: number; actual: number; gap: number }> = [];
  let entry = anchorBalance;
  for (const d of days) {
    const expected = round2(entry + d.movement);
    const gap = round2(d.close - expected);
    if (Math.abs(gap) > 0.01) {
      breaks.push({ date: d.date, expected, actual: d.close, gap });
    }
    entry = d.close;
  }

  return {
    hasData: true,
    reconciled: breaks.length === 0,
    anchorBalance,
    anchorDate,
    expectedLatest,
    actualLatest,
    actualDate,
    discrepancy,
    breaks,
  };
}

/**
 * One row per import batch (i.e. per uploaded statement PDF), in statement-period
 * order. For each we derive the period covered, row count, deposits/withdrawals,
 * and the opening (brought-forward) and closing balance — opening = the first
 * row's balance minus its own movement, closing = the last row's balance. The
 * import timestamp is recovered from the batch id (`import-<epoch-ms>-<hex>`).
 *
 * Used to spot missing or duplicated statements: consecutive statements should
 * chain, so one statement's opening balance should equal the previous one's
 * closing. The Bank page flags where it doesn't.
 */
export function getBankImportBatches() {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const rows = db()
    .prepare(
      `SELECT import_batch, trans_date, deposit, withdrawal, balance
       FROM bank_transactions
       ORDER BY trans_date ASC, id ASC`
    )
    .all() as Array<{
      import_batch: string;
      trans_date: string;
      deposit: number;
      withdrawal: number;
      balance: number;
    }>;

  type Batch = {
    batch: string;
    importedAt: string | null;
    firstDate: string;
    lastDate: string;
    rowCount: number;
    deposits: number;
    withdrawals: number;
    net: number;
    opening: number;
    closing: number;
  };

  const map = new Map<string, Batch>();
  for (const r of rows) {
    let b = map.get(r.import_batch);
    if (!b) {
      // First row encountered for this batch is its earliest (rows are ordered).
      const m = r.import_batch.match(/^import-(\d+)-/);
      let importedAt: string | null = null;
      if (m) {
        const d = new Date(Number(m[1]));
        if (!isNaN(d.getTime())) importedAt = d.toISOString().slice(0, 10);
      }
      b = {
        batch: r.import_batch,
        importedAt,
        firstDate: r.trans_date,
        lastDate: r.trans_date,
        rowCount: 0,
        deposits: 0,
        withdrawals: 0,
        net: 0,
        opening: round2(r.balance - (r.deposit - r.withdrawal)),
        closing: r.balance,
      };
      map.set(r.import_batch, b);
    }
    b.lastDate = r.trans_date;
    b.closing = r.balance;
    b.rowCount += 1;
    b.deposits = round2(b.deposits + r.deposit);
    b.withdrawals = round2(b.withdrawals + r.withdrawal);
    b.net = round2(b.deposits - b.withdrawals);
  }

  return [...map.values()].sort((a, b) =>
    a.firstDate < b.firstDate ? -1
      : a.firstDate > b.firstDate ? 1
      : a.lastDate < b.lastDate ? -1
      : a.lastDate > b.lastDate ? 1
      : 0
  );
}

/* ── Category management ───────────────────────────── */

export function setCategoryForTransaction(txnId: number, category: string | null) {
  db()
    .prepare("UPDATE bank_transactions SET category = ? WHERE id = ?")
    .run(category, txnId);
}

/* ── Transaction splits (multi-category breakdown) ─── */

export interface TransactionSplit {
  id: number;
  txn_id: number;
  category: string;
  amount: number;
  notes: string | null;
  created_at: string;
}

export interface TransactionSplitInput {
  category: string;
  amount: number;
  notes?: string | null;
}

export function getTransactionSplits(txnId: number): TransactionSplit[] {
  return db()
    .prepare("SELECT * FROM bank_transaction_splits WHERE txn_id = ? ORDER BY id")
    .all(txnId) as TransactionSplit[];
}

/** Bulk-fetch splits for a list of transaction IDs. Returns a map. */
export function getSplitsByTxnIds(txnIds: number[]): Record<number, TransactionSplit[]> {
  if (txnIds.length === 0) return {};
  const placeholders = txnIds.map(() => "?").join(",");
  const rows = db()
    .prepare(`SELECT * FROM bank_transaction_splits WHERE txn_id IN (${placeholders}) ORDER BY id`)
    .all(...txnIds) as TransactionSplit[];
  const out: Record<number, TransactionSplit[]> = {};
  for (const r of rows) {
    if (!out[r.txn_id]) out[r.txn_id] = [];
    out[r.txn_id].push(r);
  }
  return out;
}

export function getCategorisedStamp(txnId: number): { categorised_at: string | null; username: string | null } {
  const row = db()
    .prepare(
      `SELECT bt.categorised_at, u.username
       FROM bank_transactions bt
       LEFT JOIN users u ON u.id = bt.categorised_by
       WHERE bt.id = ?`
    )
    .get(txnId) as { categorised_at: string | null; username: string | null } | undefined;
  return row ?? { categorised_at: null, username: null };
}

/**
 * Replace all splits for a transaction with the given list. Atomic.
 * Sets categorised_at and categorised_by stamps. Also writes the first
 * split's category back to bank_transactions.category to keep the legacy
 * column readable (though all I&E reads from the splits table now).
 */
export function setTransactionSplits(
  txnId: number,
  splits: TransactionSplitInput[],
  userId: number,
) {
  const d = db();
  const insertSplit = d.prepare(
    "INSERT INTO bank_transaction_splits (txn_id, category, amount, notes) VALUES (?, ?, ?, ?)"
  );
  const deleteSplits = d.prepare("DELETE FROM bank_transaction_splits WHERE txn_id = ?");
  const stamp = d.prepare(
    // Setting splits also flags the row as a non-player item (status='ignored')
    // so it leaves "Needs action", counts under "Other (in accounts)", and shows
    // the categorised pill — whether reached via Ignore→Categorise or by
    // categorising an expense directly. No-op for rows already ignored.
    "UPDATE bank_transactions SET categorised_at = datetime('now'), categorised_by = ?, category = ?, status = 'ignored' WHERE id = ?"
  );

  const tx = d.transaction((items: TransactionSplitInput[]) => {
    deleteSplits.run(txnId);
    for (const s of items) {
      insertSplit.run(txnId, s.category, s.amount, s.notes ?? null);
    }
    const primary = items.length > 0 ? items[0].category : null;
    stamp.run(userId, primary, txnId);
  });
  tx(splits);
}

export function clearTransactionSplits(txnId: number, userId: number) {
  const d = db();
  d.prepare("DELETE FROM bank_transaction_splits WHERE txn_id = ?").run(txnId);
  d.prepare(
    "UPDATE bank_transactions SET categorised_at = NULL, categorised_by = NULL, category = NULL WHERE id = ?"
  ).run(txnId);
  void userId; // future: log who cleared
}

/* ── Accounts / Income & Expenditure ───────────────── */

export interface AccountLine {
  category: string;
  total: number;
  count: number;
}

export function getIncomeAndExpenditure(opts?: { from?: string; to?: string }) {
  const d = db();
  const dateConditions: string[] = [];
  const dateParams: (string | number)[] = [];

  if (opts?.from) {
    dateConditions.push("bt.trans_date >= ?");
    dateParams.push(opts.from);
  }
  if (opts?.to) {
    dateConditions.push("bt.trans_date <= ?");
    dateParams.push(opts.to);
  }

  const dateWhere = dateConditions.length > 0 ? " AND " + dateConditions.join(" AND ") : "";

  // Player-allocated income.
  //
  // We use bank_transactions.allocated_amount as the source of truth for the
  // total allocated figure — that's what the Bank page summary uses too, so
  // the two screens stay consistent. Then we subtract any allocations that
  // were specifically kit payments (kind='kit') so they flow to Kit sales
  // instead of Session fees.
  //
  // This is more robust than summing bank_allocations.amount directly: it
  // matches whatever the rest of the app considers "allocated", and is
  // resilient to any historical divergence between allocated_amount and
  // SUM(bank_allocations.amount).
  const totalAllocWhere = "WHERE allocated_amount > 0"
    + (opts?.from ? " AND trans_date >= ?" : "")
    + (opts?.to   ? " AND trans_date <= ?" : "");
  const totalAllocParams: (string | number)[] = [];
  if (opts?.from) totalAllocParams.push(opts.from);
  if (opts?.to)   totalAllocParams.push(opts.to);

  const totalAlloc = d
    .prepare(
      `SELECT COALESCE(SUM(allocated_amount), 0) AS total, COUNT(*) AS count
       FROM bank_transactions ${totalAllocWhere}`
    )
    .get(...totalAllocParams) as { total: number; count: number };

  const kitAlloc = d
    .prepare(
      `SELECT COALESCE(SUM(a.amount), 0) AS total, COUNT(*) AS count
       FROM bank_allocations a
       JOIN bank_transactions bt ON bt.id = a.bank_transaction_id
       WHERE a.kind = 'kit' ${dateWhere}`
    )
    .get(...dateParams) as { total: number; count: number };

  // session_fees = total allocated minus kit allocations
  const sessionFeesTotal = Math.round((totalAlloc.total - kitAlloc.total) * 100) / 100;
  const sessionFees = {
    total: sessionFeesTotal > 0 ? sessionFeesTotal : 0,
    count: Math.max(totalAlloc.count - kitAlloc.count, 0),
  };
  const kitFromAllocations = { total: kitAlloc.total, count: kitAlloc.count };

  // Aggregated splits joined with the parent transaction (for date filtering
  // and to know whether the parent is a deposit or withdrawal). One split row
  // contributes to either income or expense based on the parent's direction.
  const splitRows = d
    .prepare(
      `SELECT
         s.category,
         bt.deposit > 0 AS is_income,
         SUM(s.amount) AS total,
         COUNT(*) AS count
       FROM bank_transaction_splits s
       JOIN bank_transactions bt ON bt.id = s.txn_id
       WHERE 1=1 ${dateWhere}
       GROUP BY s.category, is_income`
    )
    .all(...dateParams) as Array<{
    category: string;
    is_income: number;
    total: number;
    count: number;
  }>;

  // Uncategorised ignored transactions (no splits at all)
  const uncategorised = d
    .prepare(
      `SELECT COALESCE(SUM(deposit), 0) AS total_deposit,
              COALESCE(SUM(withdrawal), 0) AS total_withdrawal,
              COUNT(*) AS count
       FROM bank_transactions bt
       WHERE bt.status = 'ignored'
         AND NOT EXISTS (SELECT 1 FROM bank_transaction_splits s WHERE s.txn_id = bt.id)
         ${dateWhere}`
    )
    .get(...dateParams) as { total_deposit: number; total_withdrawal: number; count: number };

  // Build income & expense lines
  const income: AccountLine[] = [];
  if (sessionFees.total > 0) {
    income.push({ category: "session_fees", total: sessionFees.total, count: sessionFees.count });
  }
  const expenses: AccountLine[] = [];
  for (const row of splitRows) {
    if (row.is_income) {
      income.push({ category: row.category, total: row.total, count: row.count });
    } else {
      expenses.push({ category: row.category, total: row.total, count: row.count });
    }
  }

  // Kit payments via bank_allocations (kind='kit') feed into the same "kit_sales"
  // income line. If a kit_sales split already exists for the period (from the
  // legacy ignore+categorise flow), combine into one line rather than two.
  if (kitFromAllocations.total > 0) {
    const existingKit = income.find((l) => l.category === "kit_sales");
    if (existingKit) {
      existingKit.total += kitFromAllocations.total;
      existingKit.count += kitFromAllocations.count;
    } else {
      income.push({ category: "kit_sales", total: kitFromAllocations.total, count: kitFromAllocations.count });
    }
  }

  const totalIncome = income.reduce((s, l) => s + l.total, 0);
  const totalExpenses = expenses.reduce((s, l) => s + l.total, 0);

  return {
    income,
    expenses,
    totalIncome,
    totalExpenses,
    surplus: totalIncome - totalExpenses,
    uncategorisedDeposits: uncategorised.total_deposit,
    uncategorisedWithdrawals: uncategorised.total_withdrawal,
    uncategorisedCount: uncategorised.count,
  };
}

/* ── Kit orders ──────────────────────────────────────
   One row per (player, kit_year). Status flows
   pending → confirmed/declined → paid → collected. */

export type KitOrderStatus = 'pending' | 'confirmed' | 'declined' | 'paid' | 'gifted' | 'collected';

export interface KitOrder {
  id: number;
  player_id: number;
  kit_year: string;
  token: string;
  status: KitOrderStatus;
  confirmed_at: string | null;
  paid_at: string | null;
  gifted_at: string | null;
  collected_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface KitOrderRow extends KitOrder {
  player_code: string;
  player_name: string;
  parent_name: string | null;
  parent_phone: string | null;
}

/**
 * Make sure every active player has a kit_orders row for the given year.
 * Idempotent — only inserts where one doesn't already exist.
 */
export function ensureKitOrdersForAllPlayers(kitYear: string) {
  const d = db();
  const missing = d.prepare(
    `SELECT p.id FROM players p
     WHERE NOT EXISTS (
       SELECT 1 FROM kit_orders k WHERE k.player_id = p.id AND k.kit_year = ?
     )`
  ).all(kitYear) as Array<{ id: number }>;

  if (missing.length === 0) return;

  const insert = d.prepare(
    "INSERT INTO kit_orders (player_id, kit_year, token) VALUES (?, ?, ?)"
  );
  const tx = d.transaction((rows: typeof missing) => {
    for (const r of rows) {
      const token = crypto.randomBytes(16).toString("hex");
      insert.run(r.id, kitYear, token);
    }
  });
  tx(missing);
}

export function getAllKitOrders(kitYear: string): KitOrderRow[] {
  return db().prepare(
    `SELECT k.*, p.code AS player_code, p.name AS player_name,
            p.parent_name, p.parent_phone
     FROM kit_orders k
     JOIN players p ON p.id = k.player_id
     WHERE k.kit_year = ?
     ORDER BY p.play_status = 'Active' DESC, p.name COLLATE NOCASE`
  ).all(kitYear) as KitOrderRow[];
}

export function getKitOrderByToken(token: string): KitOrderRow | undefined {
  return db().prepare(
    `SELECT k.*, p.code AS player_code, p.name AS player_name,
            p.parent_name, p.parent_phone
     FROM kit_orders k
     JOIN players p ON p.id = k.player_id
     WHERE k.token = ?`
  ).get(token) as KitOrderRow | undefined;
}

export function getKitOrderForPlayer(playerId: number, kitYear: string): KitOrder | undefined {
  return db().prepare(
    "SELECT * FROM kit_orders WHERE player_id = ? AND kit_year = ?"
  ).get(playerId, kitYear) as KitOrder | undefined;
}

export function setKitOrderStatus(orderId: number, status: KitOrderStatus) {
  const d = db();
  // Each transition stamps its own timestamp. 'paid' and 'gifted' are mutually
  // exclusive (a kit is either sold or given free), so setting one clears the other.
  switch (status) {
    case 'confirmed':
      d.prepare(
        "UPDATE kit_orders SET status='confirmed', confirmed_at=COALESCE(confirmed_at, datetime('now')) WHERE id=?"
      ).run(orderId);
      break;
    case 'paid':
      d.prepare(
        "UPDATE kit_orders SET status='paid', paid_at=COALESCE(paid_at, datetime('now')), gifted_at=NULL, confirmed_at=COALESCE(confirmed_at, datetime('now')) WHERE id=?"
      ).run(orderId);
      break;
    case 'gifted':
      d.prepare(
        "UPDATE kit_orders SET status='gifted', gifted_at=COALESCE(gifted_at, datetime('now')), paid_at=NULL, confirmed_at=COALESCE(confirmed_at, datetime('now')) WHERE id=?"
      ).run(orderId);
      break;
    case 'collected':
      d.prepare(
        "UPDATE kit_orders SET status='collected', collected_at=COALESCE(collected_at, datetime('now')), confirmed_at=COALESCE(confirmed_at, datetime('now')) WHERE id=?"
      ).run(orderId);
      break;
    case 'declined':
      d.prepare(
        "UPDATE kit_orders SET status='declined', confirmed_at=NULL, paid_at=NULL, gifted_at=NULL, collected_at=NULL WHERE id=?"
      ).run(orderId);
      break;
    default: // pending — reset stamps
      d.prepare(
        "UPDATE kit_orders SET status='pending', confirmed_at=NULL, paid_at=NULL, gifted_at=NULL, collected_at=NULL WHERE id=?"
      ).run(orderId);
  }
}

export function setKitOrderNotes(orderId: number, notes: string | null) {
  db().prepare("UPDATE kit_orders SET notes = ? WHERE id = ?").run(notes, orderId);
}

