import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getPlayer, getPlayerAttendance, getPlayerAttendanceStats, getPlayerPurchases, getPlayerBankAllocations, updatePlayer, addSessionAdjustment } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  const { id } = await params;
  const sp = await searchParams;
  const player = getPlayer(Number(id));
  if (!player) notFound();

  const attStats   = getPlayerAttendanceStats(player.id);
  const recentAtt  = getPlayerAttendance(player.id, 50);
  const purchases  = getPlayerPurchases(player.id);
  const bankAllocs = getPlayerBankAllocations(player.id);

  /* ── Session balance ──────────────────────────────── */
  const totalPaid     = purchases.reduce((s, p) => s + p.sessions_purchased, 0);
  const totalAttended = attStats.attended;
  const balance       = totalPaid - totalAttended;

  /* ── Financial summary ────────────────────────────── */
  const paidPurchases = purchases.filter(p => p.type === "Purchase");
  const totalAmountPaid = paidPurchases.reduce((s, p) => s + p.amount_paid, 0);
  const paidSessions = paidPurchases.reduce((s, p) => s + p.sessions_purchased, 0);
  const freeSessions = purchases
    .filter(p => p.type === "Adjustment" && p.amount_paid === 0 && p.sessions_purchased > 0)
    .reduce((s, p) => s + p.sessions_purchased, 0);
  const avgCostPerSession = paidSessions > 0 ? Math.round(totalAmountPaid / paidSessions) : 0;
  const lastPaymentDate = paidPurchases.length > 0 ? paidPurchases[0].purchase_date : null;

  /* ── Attendance stats ─────────────────────────────── */
  const attendanceRate = attStats.total > 0
    ? Math.round((attStats.attended / attStats.total) * 100)
    : 0;

  // Last 10 sessions streak
  const recent10 = recentAtt.slice(0, 10);
  let currentStreak = 0;
  for (const a of recent10) {
    if (a.attended === 1) currentStreak++;
    else break;
  }

  const isAdmin = auth.role === "admin";
  const editing = sp.edit === "1" && isAdmin;

  async function handleAdjustment(formData: FormData) {
    "use server";
    const playerId = Number(formData.get("player_id"));
    const sessions = parseInt(formData.get("sessions") as string, 10);
    const type = formData.get("type") as string;
    const notes = (formData.get("notes") as string) || null;

    if (!playerId || isNaN(sessions) || sessions === 0) {
      redirect(`/players/${playerId}?error=invalid`);
    }

    addSessionAdjustment(playerId, sessions, type, notes);
    redirect(`/players/${playerId}?success=adjusted`);
  }

  async function handleSave(formData: FormData) {
    "use server";
    const playerId = Number(formData.get("player_id"));
    updatePlayer(playerId, {
      name:        formData.get("name") as string,
      country:     (formData.get("country") as string) || null,
      source:      (formData.get("source") as string) || null,
      play_status: formData.get("play_status") as string,
      scholarship: formData.get("scholarship") === "1" ? 1 : 0,
      notes:       (formData.get("notes") as string) || null,
    });
    redirect(`/players/${playerId}`);
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>{player.code} — {player.name}</h2>
        <div className="gap-sm">
          <a href="/players" className="btn btn-sm">Back to list</a>
          {isAdmin && !editing && (
            <a href={`/players/${player.id}?edit=1`} className="btn btn-sm btn-primary">Edit</a>
          )}
        </div>
      </div>

      {/* ── Session balance summary ───────────────── */}
      <div className="summary-row">
        <div className="chip">
          <span className="chip-value">{totalPaid}</span>
          <span className="chip-label">Sessions Paid</span>
        </div>
        <div className="chip">
          <span className="chip-value">{totalAttended}</span>
          <span className="chip-label">Attended</span>
        </div>
        <div className="chip">
          <span className="chip-value" style={{
            color: balance < 0 ? "var(--danger)" : balance > 0 ? "var(--success)" : "var(--warning)"
          }}>{balance}</span>
          <span className="chip-label">Balance</span>
        </div>
      </div>

      {/* ── Financial + Attendance stats ──────────── */}
      <div className="summary-row" style={{ marginTop: "0.5rem" }}>
        <div className="chip">
          <span className="chip-value" style={{ fontSize: "1rem" }}>₦{totalAmountPaid.toLocaleString()}</span>
          <span className="chip-label">Total Paid</span>
        </div>
        <div className="chip">
          <span className="chip-value" style={{ fontSize: "1rem" }}>₦{avgCostPerSession.toLocaleString()}</span>
          <span className="chip-label">Avg / Paid Session</span>
        </div>
        {freeSessions > 0 && (
          <div className="chip">
            <span className="chip-value">{freeSessions}</span>
            <span className="chip-label">Free Sessions</span>
          </div>
        )}
        <div className="chip">
          <span className="chip-value">{lastPaymentDate ?? "—"}</span>
          <span className="chip-label">Last Payment</span>
        </div>
        <div className="chip">
          <span className="chip-value" style={{
            color: attendanceRate >= 75 ? "var(--success)" : attendanceRate >= 50 ? "var(--warning)" : "var(--danger)"
          }}>{attendanceRate}%</span>
          <span className="chip-label">Attendance Rate</span>
        </div>
        <div className="chip">
          <span className="chip-value">{currentStreak}/{recent10.length}</span>
          <span className="chip-label">Recent Streak</span>
        </div>
      </div>

      {/* ── Messages ─────────────────────────────── */}
      {sp.success === "adjusted" && (
        <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          Session adjustment added.
        </div>
      )}
      {sp.error === "invalid" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Please enter a valid number of sessions.</div>
      )}

      {/* ── Add credit / adjustment (admin only) ── */}
      {isAdmin && !editing && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginBottom: "0.5rem" }}>Add Session Credit</h2>
          <form action={handleAdjustment}>
            <input type="hidden" name="player_id" value={player.id} />
            <div className="form-row" style={{ alignItems: "flex-end" }}>
              <div className="form-group">
                <label htmlFor="sessions">Sessions</label>
                <input id="sessions" name="sessions" type="number" min="1" defaultValue="1" required style={{ maxWidth: "100px" }} />
              </div>
              <div className="form-group">
                <label htmlFor="type">Type</label>
                <select id="type" name="type" style={{ maxWidth: "180px" }}>
                  <option value="Adjustment">Free session</option>
                  <option value="Transfer">Transfer from another player</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="adj_notes">Notes (optional)</label>
                <input id="adj_notes" name="notes" type="text" placeholder="e.g. Birthday bonus" />
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginBottom: "0.25rem" }}>Add</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Player details (view or edit) ──────────── */}
      <div className="card">
        <h2>Player Details</h2>
        {editing ? (
          <form action={handleSave}>
            <input type="hidden" name="player_id" value={player.id} />
            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input name="name" type="text" defaultValue={player.name} required />
              </div>
              <div className="form-group">
                <label>Age Group</label>
                <input name="source" type="text" defaultValue={player.source ?? ""} />
              </div>
              <div className="form-group">
                <label>Play Status</label>
                <select name="play_status" defaultValue={player.play_status}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Left">Left</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Scholarship</label>
                <select name="scholarship" defaultValue={player.scholarship ? "1" : "0"}>
                  <option value="0">No</option>
                  <option value="1">Yes</option>
                </select>
              </div>
            </div>
            <div className="form-row full">
              <div className="form-group">
                <label>Notes</label>
                <textarea name="notes" defaultValue={player.notes ?? ""} />
              </div>
            </div>
            <div className="gap-sm mt-1">
              <button type="submit" className="btn btn-primary">Save</button>
              <a href={`/players/${player.id}`} className="btn">Cancel</a>
            </div>
          </form>
        ) : (
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.35rem 1.5rem", fontSize: "0.9rem" }}>
            <dt className="text-dim">Code</dt>        <dd>{player.code}</dd>
            <dt className="text-dim">Age Group</dt>   <dd>{player.source ?? "—"}</dd>
            <dt className="text-dim">Play Status</dt> <dd>{player.play_status}</dd>
            <dt className="text-dim">Scholarship</dt> <dd>{player.scholarship ? "Yes" : "No"}</dd>
            <dt className="text-dim">Notes</dt>       <dd>{player.notes ?? "—"}</dd>
          </dl>
        )}
      </div>

      {/* ── Bank payment history ───────────────────── */}
      {isAdmin && (
        <details open={bankAllocs.length > 0 && bankAllocs.length <= 10}>
          <summary>Bank Payments ({bankAllocs.length} entries)</summary>
          <div className="detail-body">
            {bankAllocs.length === 0 ? (
              <p className="text-dim">No bank allocations linked to this player.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Sessions</th>
                    <th>Package</th>
                    <th>Reference</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bankAllocs.map((a) => (
                    <tr key={a.id}>
                      <td>{a.trans_date}</td>
                      <td className="text-right" style={{ color: "#2f9e44", fontWeight: 500 }}>
                        ₦{a.amount.toLocaleString()}
                      </td>
                      <td className="text-right">{a.sessions_purchased}</td>
                      <td>{a.package ?? "—"}</td>
                      <td style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis" }} title={a.reference}>
                        {a.reference || "—"}
                      </td>
                      <td className="text-dim">{a.notes ?? ""}</td>
                      <td>
                        <a href={`/bank/${a.txn_id}/allocate`} className="btn btn-sm">View Txn</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      )}

      {/* ── Purchase history (accordion) ───────────── */}
      <details open={purchases.length > 0 && purchases.length <= 10}>
        <summary>Purchase History ({purchases.length} entries)</summary>
        <div className="detail-body">
          {purchases.length === 0 ? (
            <p className="text-dim">No purchase records.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Type</th><th className="text-right">Amount</th>
                  <th className="text-right">Sessions</th><th>Package</th><th>Reference</th><th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p, i) => (
                  <tr key={i}>
                    <td>{p.purchase_date}</td>
                    <td>{p.type}</td>
                    <td className="text-right">{p.amount_paid ? `₦${p.amount_paid.toLocaleString()}` : "—"}</td>
                    <td className="text-right">{p.sessions_purchased}</td>
                    <td>{p.package ?? ""}</td>
                    <td>{p.bank_ref ?? ""}</td>
                    <td className="text-dim">{p.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>

      {/* ── Attendance history (accordion) ──────────── */}
      <details>
        <summary>Recent Attendance (last {recentAtt.length} of {attStats.total} sessions)</summary>
        <div className="detail-body">
          {recentAtt.length === 0 ? (
            <p className="text-dim">No attendance records.</p>
          ) : (
            <table>
              <thead><tr><th>Date</th><th>Attended</th></tr></thead>
              <tbody>
                {recentAtt.map((a, i) => (
                  <tr key={i}>
                    <td>{a.session_date}</td>
                    <td>{a.attended ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </>
  );
}
