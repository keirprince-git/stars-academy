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
      notes                 TEXT,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_att_player   ON attendance_log(player_id);
    CREATE INDEX IF NOT EXISTS idx_att_date     ON attendance_log(session_date);
    CREATE INDEX IF NOT EXISTS idx_sp_player    ON sessions_purchased(player_id);
    CREATE INDEX IF NOT EXISTS idx_bt_status    ON bank_transactions(status);
    CREATE INDEX IF NOT EXISTS idx_bt_batch     ON bank_transactions(import_batch);
    CREATE INDEX IF NOT EXISTS idx_ba_txn       ON bank_allocations(bank_transaction_id);
    CREATE INDEX IF NOT EXISTS idx_ba_player    ON bank_allocations(player_id);
  `);
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

export function removeBankAllocation(allocationId: number) {
  const d = db();
  const alloc = d.prepare("SELECT * FROM bank_allocations WHERE id = ?").get(allocationId) as BankAllocation | undefined;
  if (!alloc) throw new Error("Allocation not found");

  const tx = d.transaction(() => {
    // Delete the linked sessions_purchased record
    if (alloc.purchase_id) {
      d.prepare("DELETE FROM sessions_purchased WHERE id = ?").run(alloc.purchase_id);
    }
    // Delete the allocation
    d.prepare("DELETE FROM bank_allocations WHERE id = ?").run(allocationId);
    // Recalculate status
    refreshTxnStatus(d, alloc.bank_transaction_id);
  });

  tx();
}

export function ignoreBankTransaction(txnId: number, reason: string | null) {
  db()
    .prepare("UPDATE bank_transactions SET status = 'ignored', notes = ? WHERE id = ?")
    .run(reason, txnId);
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
         COUNT(CASE WHEN status='ignored' THEN 1 END) AS ignored,
         COALESCE(SUM(CASE WHEN (status='unallocated' OR status='partial') AND deposit > 0 THEN deposit - allocated_amount END), 0) AS unallocated_amount,
         COALESCE(SUM(allocated_amount), 0) AS total_allocated_amount
       FROM bank_transactions`
    )
    .get() as {
    total: number;
    unallocated: number;
    allocated: number;
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

/* ── Category management ───────────────────────────── */

export function setCategoryForTransaction(txnId: number, category: string | null) {
  db()
    .prepare("UPDATE bank_transactions SET category = ? WHERE id = ?")
    .run(category, txnId);
}

/* ── Accounts / Income & Expenditure ───────────────── */

export interface AccountLine {
  category: string;
  total: number;
  count: number;
}

export function getIncomeAndExpenditure(opts?: { from?: string; to?: string }) {
  const d = db();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts?.from) {
    conditions.push("trans_date >= ?");
    params.push(opts.from);
  }
  if (opts?.to) {
    conditions.push("trans_date <= ?");
    params.push(opts.to);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  // Session fees: sum of allocated amounts (these are player fee income)
  const sessionFees = d
    .prepare(
      `SELECT COALESCE(SUM(allocated_amount), 0) AS total, COUNT(*) AS count
       FROM bank_transactions ${where ? where + " AND" : "WHERE"} allocated_amount > 0`
    )
    .get(...params) as { total: number; count: number };

  // Categorised transactions (deposits = income, withdrawals = expense)
  const categorised = d
    .prepare(
      `SELECT category,
              COALESCE(SUM(deposit), 0) AS total_deposit,
              COALESCE(SUM(withdrawal), 0) AS total_withdrawal,
              COUNT(*) AS count
       FROM bank_transactions
       ${where ? where + (conditions.length > 0 ? " AND" : "") : "WHERE"} category IS NOT NULL
       GROUP BY category`
    )
    .all(...params) as Array<{
    category: string;
    total_deposit: number;
    total_withdrawal: number;
    count: number;
  }>;

  // Uncategorised ignored transactions
  const uncategorised = d
    .prepare(
      `SELECT COALESCE(SUM(deposit), 0) AS total_deposit,
              COALESCE(SUM(withdrawal), 0) AS total_withdrawal,
              COUNT(*) AS count
       FROM bank_transactions
       ${where ? where + " AND" : "WHERE"} status = 'ignored' AND category IS NULL`
    )
    .get(...params) as { total_deposit: number; total_withdrawal: number; count: number };

  // Build income lines
  const income: AccountLine[] = [];
  if (sessionFees.total > 0) {
    income.push({ category: "session_fees", total: sessionFees.total, count: sessionFees.count });
  }
  for (const row of categorised) {
    if (row.total_deposit > 0) {
      income.push({ category: row.category, total: row.total_deposit, count: row.count });
    }
  }

  // Build expense lines
  const expenses: AccountLine[] = [];
  for (const row of categorised) {
    if (row.total_withdrawal > 0) {
      expenses.push({ category: row.category, total: row.total_withdrawal, count: row.count });
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
