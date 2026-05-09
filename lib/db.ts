import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";
import type { Player, DashboardRow, User, Session } from "./types";

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
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT    NOT NULL UNIQUE,
      name        TEXT    NOT NULL,
      country     TEXT,
      source      TEXT,
      play_status TEXT    NOT NULL DEFAULT 'Active'
                  CHECK (play_status IN ('Active','Inactive','Left')),
      scholarship INTEGER NOT NULL DEFAULT 0,
      notes       TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
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

    CREATE INDEX IF NOT EXISTS idx_att_player   ON attendance_log(player_id);
    CREATE INDEX IF NOT EXISTS idx_att_date     ON attendance_log(session_date);
    CREATE INDEX IF NOT EXISTS idx_sp_player    ON sessions_purchased(player_id);
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
  data: Partial<Pick<Player, "name" | "country" | "source" | "play_status" | "scholarship" | "notes">>
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

export function getPlayerAttendance(playerId: number) {
  return db()
    .prepare(
      `SELECT session_date, attended FROM attendance_log
       WHERE player_id = ? ORDER BY session_date DESC LIMIT 50`
    )
    .all(playerId) as { session_date: string; attended: number }[];
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
