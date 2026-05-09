/* ── Domain types ────────────────────────────────────── */

export interface Player {
  id: number;
  code: string;            // P001, P002 …
  name: string;
  country: string | null;
  source: string | null;
  play_status: string;     // Active / Inactive / Left
  scholarship: number;     // 0 or 1
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRow {
  id: number;
  player_id: number;
  session_date: string;    // ISO date
  attended: number;        // 0 or 1
  created_at: string;
}

export interface SessionPurchase {
  id: number;
  player_id: number;
  purchase_date: string;
  type: string;            // Purchase | Adjustment | Transfer | Opening balance
  amount_paid: number;
  sessions_purchased: number;
  package: string | null;
  bank_ref: string | null;
  notes: string | null;
  created_at: string;
}

export interface DashboardRow {
  player_id: number;
  code: string;
  name: string;
  sessions_paid: number;
  sessions_attended: number;
  balance: number;
  pay_status: string;
  play_status: string;
  scholarship: number;
  notes: string | null;
}

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'recorder';
  created_at: string;
}

export interface Session {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
}
