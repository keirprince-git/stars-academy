import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getPlayer, getPlayerAttendance, getPlayerAttendanceStats, getPlayerPurchases, getPlayerBankAllocations, getPlayers, updatePlayer, addFreeSessionCredit, transferSessions } from "@/lib/db";
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

  const isAdmin = auth.role === "admin";
  const editing = sp.edit === "1" && isAdmin;

  const allPlayers = isAdmin ? getPlayers({ status: "Active", sort: "name", dir: "asc" }) : [];

  async function handleFreeCredit(formData: FormData) {
    "use server";
    const playerId = Number(formData.get("player_id"));
    const sessions = parseInt(formData.get("sessions") as string, 10);
    const notes = (formData.get("notes") as string) || null;

    if (!playerId || isNaN(sessions) || sessions <= 0) {
      redirect(`/players/${playerId}?error=invalid`);
    }

    addFreeSessionCredit(playerId, sessions, notes);
    redirect(`/players/${playerId}?success=free`);
  }

  async function handleTransfer(formData: FormData) {
    "use server";
    const toPlayerId = Number(formData.get("player_id"));
    const fromPlayerId = Number(formData.get("from_player_id"));
    const sessions = parseInt(formData.get("sessions") as string, 10);
    const notes = (formData.get("notes") as string) || null;

    if (!toPlayerId || !fromPlayerId || toPlayerId === fromPlayerId || isNaN(sessions) || sessions <= 0) {
      redirect(`/players/${toPlayerId}?error=invalid_transfer`);
    }

    transferSessions(fromPlayerId, toPlayerId, sessions, notes);
    redirect(`/players/${toPlayerId}?success=transfer`);
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
      </div>

      {/* ── Messages ─────────────────────────────── */}
      {sp.success === "free" && (
        <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          Free session credit added.
        </div>
      )}
      {sp.success === "transfer" && (
        <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          Sessions transferred successfully.
        </div>
      )}
      {sp.error === "invalid" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Please enter a valid number of sessions.</div>
      )}
      {sp.error === "invalid_transfer" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Invalid transfer — check both players and session count.</div>
      )}

      {/* ── Admin actions (admin only) ────────────── */}
      {isAdmin && !editing && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          {/* Free sessions */}
          <div className="card">
            <h2 style={{ marginBottom: "0.5rem" }}>Give Free Sessions</h2>
            <form action={handleFreeCredit}>
              <input type="hidden" name="player_id" value={player.id} />
              <div className="form-row" style={{ alignItems: "flex-end" }}>
                <div className="form-group">
                  <label htmlFor="free_sessions">Sessions</label>
                  <input id="free_sessions" name="sessions" type="number" min="1" defaultValue="1" required style={{ maxWidth: "80px" }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="free_notes">Notes</label>
                  <input id="free_notes" name="notes" type="text" placeholder="e.g. Birthday bonus" />
                </div>
                <button type="submit" className="btn btn-primary" style={{ marginBottom: "0.25rem" }}>Add</button>
              </div>
            </form>
          </div>

          {/* Transfer */}
          <div className="card">
            <h2 style={{ marginBottom: "0.5rem" }}>Transfer Sessions In</h2>
            <form action={handleTransfer}>
              <input type="hidden" name="player_id" value={player.id} />
              <div className="form-row" style={{ alignItems: "flex-end" }}>
                <div className="form-group">
                  <label htmlFor="from_player_id">From</label>
                  <select id="from_player_id" name="from_player_id" required style={{ maxWidth: "200px" }}>
                    <option value="">— Select —</option>
                    {allPlayers.filter(p => p.id !== player.id).map(p => (
                      <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="xfer_sessions">Sessions</label>
                  <input id="xfer_sessions" name="sessions" type="number" min="1" defaultValue="1" required style={{ maxWidth: "80px" }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label htmlFor="xfer_notes">Notes</label>
                  <input id="xfer_notes" name="notes" type="text" placeholder="e.g. Sibling share" />
                </div>
                <button type="submit" className="btn btn-primary" style={{ marginBottom: "0.25rem" }}>Transfer</button>
              </div>
            </form>
          </div>
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
