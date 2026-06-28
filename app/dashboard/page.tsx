import { requireAuth } from "@/lib/auth";
import { getDashboard, getDashboardSummary, getMonthlySummary } from "@/lib/db";
import type { DashboardRow } from "@/lib/types";

function Delta({ delta, money }: { delta: number; money: boolean }) {
  if (!delta) return null;
  const up = delta > 0;
  const val = money ? `₦${Math.round(Math.abs(delta)).toLocaleString()}` : String(Math.abs(delta));
  return <span style={{ color: up ? "var(--success)" : "var(--danger)" }}> {up ? "▲" : "▼"}{val}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "OVERDUE"     ? "badge badge-overdue"   :
    status === "Credit"      ? "badge badge-credit"    :
    status === "Fully used"  ? "badge badge-fullyused" :
    status === "Scholarship" ? "badge badge-scholar"   :
    "badge";
  return <span className={cls}>{status}</span>;
}

function PlayBadge({ status }: { status: string }) {
  const cls =
    status === "Active"   ? "badge-active"   :
    status === "Inactive" ? "badge-inactive" :
    status === "Left"     ? "badge-left"     :
    "";
  return <span className={cls}>{status}</span>;
}

function SortLink({ field, label, current, dir, params }: {
  field: string; label: string; current: string; dir: string;
  params: URLSearchParams;
}) {
  const nextDir = current === field && dir === "asc" ? "desc" : "asc";
  const p = new URLSearchParams(params);
  p.set("sort", field);
  p.set("dir", nextDir);
  const arrow = current === field ? (dir === "asc" ? " ↑" : " ↓") : "";
  return <a href={`/dashboard?${p.toString()}`}>{label}{arrow}</a>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  const sp = await searchParams;

  const status    = sp.status    ?? "all";
  const payStatus = sp.payStatus ?? "all";
  const search    = sp.search    ?? "";
  const sort      = sp.sort      ?? "code";
  const dir       = sp.dir       ?? "asc";

  const rows = getDashboard({ status, payStatus, search });
  const summary = getDashboardSummary();

  // Financial KPIs (admin only) — latest month vs the one before.
  const monthly = auth.role === "admin" ? getMonthlySummary() : [];
  const latest = monthly.length ? monthly[monthly.length - 1] : null;
  const prev = monthly.length > 1 ? monthly[monthly.length - 2] : null;

  // Build current params for sort links
  const currentParams = new URLSearchParams();
  if (status !== "all")    currentParams.set("status", status);
  if (payStatus !== "all") currentParams.set("payStatus", payStatus);
  if (search)              currentParams.set("search", search);

  // Client-side sort (since dashboard is a computed view)
  const sortedRows = [...rows].sort((a, b) => {
    let cmp = 0;
    const key = sort as keyof DashboardRow;
    const va = a[key]; const vb = b[key];
    if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
    else cmp = String(va ?? "").localeCompare(String(vb ?? ""));
    return dir === "desc" ? -cmp : cmp;
  });

  return (
    <>
      <h2 style={{ marginBottom: "1rem" }}>Dashboard</h2>

      {/* ── Summary chips ──────────────────────────── */}
      <div className="summary-row">
        <a href="/dashboard" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="chip-value">{summary.total}</span>
          <span className="chip-label">Players</span>
        </a>
        <a href="/dashboard?status=Active" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="chip-value">{summary.active}</span>
          <span className="chip-label">Active</span>
        </a>
        <a href="/dashboard?status=Active&payStatus=OVERDUE" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="chip-value" style={{ color: "var(--danger)" }}>{summary.overdue}</span>
          <span className="chip-label">Overdue</span>
        </a>
        <a href="/dashboard?status=Active&payStatus=Credit" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="chip-value" style={{ color: "var(--success)" }}>{summary.credit}</span>
          <span className="chip-label">Credit</span>
        </a>
        <a href="/dashboard?payStatus=Scholarship" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="chip-value" style={{ color: "#5a3296" }}>{summary.scholarship}</span>
          <span className="chip-label">Scholarship</span>
        </a>
      </div>

      {/* ── Financial KPIs (admin) — latest month ─────── */}
      {auth.role === "admin" && latest && (
        <>
          <h3 style={{ fontSize: "0.95rem", margin: "1.25rem 0 0.5rem" }} className="text-dim">
            Latest month — {latest.month}
          </h3>
          <div className="summary-row">
            <a href="/accounts" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="chip-value" style={{ color: "var(--success)", fontSize: "1rem" }}>₦{Math.round(latest.earnedRevenue).toLocaleString()}</span>
              <span className="chip-label">Earned revenue{prev && <Delta delta={Math.round(latest.earnedRevenue - prev.earnedRevenue)} money />}</span>
            </a>
            <div className="chip">
              <span className="chip-value" style={{ fontSize: "1rem" }}>₦{Math.round(latest.revenuePerSession).toLocaleString()}</span>
              <span className="chip-label">Revenue / session{prev && <Delta delta={Math.round(latest.revenuePerSession - prev.revenuePerSession)} money />}</span>
            </div>
            <div className="chip">
              <span className="chip-value">{latest.attendances}</span>
              <span className="chip-label">Attendances{prev && <Delta delta={latest.attendances - prev.attendances} money={false} />}</span>
            </div>
            <div className="chip">
              <span className="chip-value">{latest.sessionsHeld}</span>
              <span className="chip-label">Sessions held</span>
            </div>
            <a href="/accounts/monthly-export" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="chip-value" style={{ fontSize: "1rem" }}>CSV ↓</span>
              <span className="chip-label">Monthly trend</span>
            </a>
          </div>
        </>
      )}

      {/* ── Filters ────────────────────────────────── */}
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <form id="dash-filter" action="/dashboard" method="GET" className="filter-bar">
        <div className="filter-group">
          <label htmlFor="f-status">Play Status</label>
          <select id="f-status" name="status" defaultValue={status}
            data-autosubmit="true">
            <option value="all">All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Left">Left</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="f-pay">Pay Status</label>
          <select id="f-pay" name="payStatus" defaultValue={payStatus}
            data-autosubmit="true">
            <option value="all">All</option>
            <option value="OVERDUE">Overdue</option>
            <option value="Credit">Credit</option>
            <option value="Fully used">Fully used</option>
            <option value="Scholarship">Scholarship</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="f-search">Search</label>
          <input id="f-search" name="search" type="search" defaultValue={search} placeholder="Name or code" />
        </div>
        <button type="submit" className="btn btn-sm btn-primary">Search</button>
        <a href="/dashboard" className="btn btn-sm">Clear</a>
      </form>

      {/* ── Table ──────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th><SortLink field="code"             label="ID"          current={sort} dir={dir} params={currentParams} /></th>
              <th><SortLink field="name"             label="Player"      current={sort} dir={dir} params={currentParams} /></th>
              <th className="text-right"><SortLink field="sessions_paid"     label="Paid"        current={sort} dir={dir} params={currentParams} /></th>
              <th className="text-right"><SortLink field="sessions_attended" label="Attended"     current={sort} dir={dir} params={currentParams} /></th>
              <th className="text-right"><SortLink field="balance"           label="Balance"      current={sort} dir={dir} params={currentParams} /></th>
              <th><SortLink field="pay_status"  label="Pay Status"  current={sort} dir={dir} params={currentParams} /></th>
              <th><SortLink field="play_status" label="Play Status" current={sort} dir={dir} params={currentParams} /></th>
              <th><SortLink field="notes"       label="Notes"       current={sort} dir={dir} params={currentParams} /></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr><td colSpan={8} className="text-center text-dim" style={{ padding: "2rem" }}>No players match the current filters.</td></tr>
            )}
            {sortedRows.map((r) => (
              <tr key={r.player_id}>
                <td><a href={`/players/${r.player_id}`}>{r.code}</a></td>
                <td><a href={`/players/${r.player_id}`}>{r.name}</a></td>
                <td className="text-right">{r.sessions_paid}</td>
                <td className="text-right">{r.sessions_attended}</td>
                <td className="text-right" style={{ fontWeight: 600 }}>{r.balance}</td>
                <td><StatusBadge status={r.pay_status} /></td>
                <td><PlayBadge status={r.play_status} /></td>
                <td className="text-dim" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.notes ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-dim" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
        Showing {sortedRows.length} player{sortedRows.length !== 1 ? "s" : ""}
      </p>

      {/* Auto-submit dropdowns on change — tiny inline script, no client component needed */}
      <script dangerouslySetInnerHTML={{ __html: `
        document.querySelectorAll('[data-autosubmit]').forEach(function(el) {
          el.addEventListener('change', function() { this.form.submit(); });
        });
      `}} />
    </>
  );
}
