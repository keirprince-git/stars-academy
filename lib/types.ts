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

export interface BankTransaction {
  id: number;
  trans_date: string;       // ISO date
  value_date: string;       // ISO date
  description: string;      // parsed transaction details
  reference: string;
  deposit: number;          // credit amount (0 if withdrawal)
  withdrawal: number;       // debit amount (0 if deposit)
  balance: number;
  status: string;           // 'unallocated' | 'partial' | 'allocated' | 'ignored'
  allocated_amount: number; // sum of all allocations so far
  import_batch: string;     // groups rows from same PDF upload
  notes: string | null;
  created_at: string;
}

export interface BankAllocation {
  id: number;
  bank_transaction_id: number;
  player_id: number;
  amount: number;           // portion of the deposit allocated to this player
  sessions_purchased: number;
  package: string | null;
  purchase_id: number | null; // linked sessions_purchased record
  notes: string | null;
  created_at: string;
}
