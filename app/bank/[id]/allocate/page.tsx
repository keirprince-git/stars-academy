import { requireAuth } from "@/lib/auth";
import { getBankTransaction, getPlayers, allocateBankTransaction } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function AllocatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAuth();
  if (auth.role !== "admin") {
    return <p className="error-msg">Only admins can allocate transactions.</p>;
  }

  const { id } = await params;
  const txnId = parseInt(id, 10);
  const txn = getBankTransaction(txnId);

  if (!txn) {
    return <p className="error-msg">Transaction not found.</p>;
  }

  if (txn.status === "allocated") {
    return (
      <>
        <h2>Already Allocated</h2>
        <p>This transaction is already allocated to {txn.player_name} ({txn.player_code}).</p>
        <a href="/bank" className="btn">Back to Bank Transactions</a>
      </>
    );
  }

  const players = getPlayers({ status: "Active", sort: "name", dir: "asc" });

  const handleAllocate = async (formData: FormData) => {
    "use server";
    const playerId = parseInt(formData.get("player_id") as string, 10);
    const sessions = parseInt(formData.get("sessions_purchased") as string, 10);
    const packageName = (formData.get("package") as string) || null;
    const notes = (formData.get("notes") as string) || null;

    if (!playerId || isNaN(sessions) || sessions <= 0) {
      redirect(`/bank/${txnId}/allocate?error=invalid`);
    }

    try {
      allocateBankTransaction(txnId, playerId, sessions, packageName, notes);
      redirect("/bank?success=allocated");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      redirect(`/bank/${txnId}/allocate?error=${encodeURIComponent(msg)}`);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Allocate Payment</h2>
        <a href="/bank" className="btn btn-sm">Back to Bank</a>
      </div>

      {/* ── Transaction summary ──────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Transaction Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.4rem 1rem", fontSize: "0.9rem" }}>
          <span className="text-dim">Date:</span>
          <span>{txn.trans_date}</span>
          <span className="text-dim">Amount:</span>
          <span style={{ color: "#2f9e44", fontWeight: 600, fontSize: "1.1rem" }}>
            ₦{txn.deposit.toLocaleString()}
          </span>
          <span className="text-dim">Description:</span>
          <span>{txn.description}</span>
          <span className="text-dim">Reference:</span>
          <span>{txn.reference || "—"}</span>
        </div>
      </div>

      {/* ── Allocation form ──────────────────────────── */}
      <div className="card">
        <h2 style={{ marginBottom: "0.75rem" }}>Assign to Player</h2>
        <form action={handleAllocate}>
          <div className="form-group">
            <label htmlFor="player_id">Player</label>
            <select id="player_id" name="player_id" required style={{ maxWidth: "400px" }}>
              <option value="">— Select a player —</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="sessions_purchased">Sessions Purchased</label>
              <input
                id="sessions_purchased"
                name="sessions_purchased"
                type="number"
                min="1"
                required
                placeholder="e.g. 8, 12, 24"
                style={{ maxWidth: "150px" }}
              />
            </div>
            <div className="form-group">
              <label htmlFor="package">Package</label>
              <select id="package" name="package" style={{ maxWidth: "200px" }}>
                <option value="">— None —</option>
                <option value="8 sessions">8 sessions</option>
                <option value="12 sessions">12 sessions</option>
                <option value="24 sessions">24 sessions</option>
                <option value="Term">Term</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes (optional)</label>
            <input
              id="notes"
              name="notes"
              type="text"
              placeholder="e.g. Payment for Term 2"
              style={{ maxWidth: "400px" }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <button type="submit" className="btn btn-primary">
              Allocate Payment
            </button>
            <a href="/bank" className="btn">Cancel</a>
          </div>
        </form>
      </div>
    </>
  );
}
