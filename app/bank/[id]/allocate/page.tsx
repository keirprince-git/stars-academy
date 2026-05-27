import { requireAuth } from "@/lib/auth";
import {
  getBankTransaction, getBankAllocations, getPlayers,
  addBankAllocation, addBankKitPayment, removeBankAllocation,
  ensureKitOrdersForAllPlayers, getAllKitOrders,
} from "@/lib/db";
import { getEffectiveTariff } from "@/lib/tariff";
import { guessPlayers } from "@/lib/match-player";
import { redirect } from "next/navigation";
import AllocationForm from "./AllocationForm";
import { KIT_YEAR, KIT_PRICE } from "@/lib/kit";

export default async function AllocatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  if (auth.role !== "admin") {
    return <p className="error-msg">Only admins can allocate transactions.</p>;
  }

  const { id } = await params;
  const sp = await searchParams;
  const txnId = parseInt(id, 10);
  const txn = getBankTransaction(txnId);

  if (!txn) {
    return <p className="error-msg">Transaction not found.</p>;
  }

  const allocations = getBankAllocations(txnId);
  const players = getPlayers({ status: "Active", sort: "name", dir: "asc" });
  const remaining = Math.round((txn.deposit - txn.allocated_amount) * 100) / 100;

  // Guess which player(s) this transaction relates to
  const guessedIds = txn.deposit > 0
    ? guessPlayers(txn.description, txn.reference, players)
    : [];
  const bestGuess = guessedIds.length > 0 ? guessedIds[0] : null;

  // Resolve the tariff (with fallback) so the package dropdown can be populated
  const effectiveTariff = getEffectiveTariff();

  // Kit orders per player — lets the form show whether each player already has
  // a paid kit, is confirmed, or hasn't acted yet.
  ensureKitOrdersForAllPlayers(KIT_YEAR);
  const kitOrders = getAllKitOrders(KIT_YEAR);
  const kitOrdersByPlayer: Record<number, { orderId: number; status: string }> = {};
  for (const k of kitOrders) {
    kitOrdersByPlayer[k.player_id] = { orderId: k.id, status: k.status };
  }

  /* ── Server actions ──────────────────────────────────── */

  const handleAllocate = async (formData: FormData) => {
    "use server";
    const kind = (formData.get("kind") as string) || "session";
    const playerId = parseInt(formData.get("player_id") as string, 10);
    const amount = parseFloat(formData.get("amount") as string);
    const notes = (formData.get("notes") as string) || null;

    if (!playerId || isNaN(amount) || amount <= 0) {
      redirect(`/bank/${txnId}/allocate?error=invalid`);
    }

    try {
      if (kind === "kit") {
        const kitOrderId = parseInt(formData.get("kit_order_id") as string, 10);
        if (!kitOrderId) redirect(`/bank/${txnId}/allocate?error=no_kit_order`);
        addBankKitPayment(txnId, playerId, amount, kitOrderId, notes);
      } else {
        const sessions = parseInt(formData.get("sessions_purchased") as string, 10);
        const packageName = (formData.get("package") as string) || null;
        if (isNaN(sessions) || sessions <= 0) {
          redirect(`/bank/${txnId}/allocate?error=invalid`);
        }
        addBankAllocation(txnId, playerId, amount, sessions, packageName, notes);
      }
      redirect(`/bank/${txnId}/allocate?success=added`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      redirect(`/bank/${txnId}/allocate?error=${encodeURIComponent(msg)}`);
    }
  };

  const handleRemove = async (formData: FormData) => {
    "use server";
    const allocId = parseInt(formData.get("alloc_id") as string, 10);
    try {
      removeBankAllocation(allocId);
      redirect(`/bank/${txnId}/allocate?success=removed`);
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

      {sp.success === "added" && (
        <div className="alert alert-success">
          Allocation added.
        </div>
      )}
      {sp.success === "removed" && (
        <div className="alert alert-success">
          Allocation removed.
        </div>
      )}
      {sp.error === "invalid" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Please fill in all required fields.</div>
      )}
      {sp.error === "no_kit_order" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>No kit order found for that player.</div>
      )}
      {sp.error && !["invalid", "no_kit_order"].includes(sp.error) && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>{sp.error}</div>
      )}

      {/* ── Transaction summary ──────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Transaction Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.4rem 1rem", fontSize: "0.9rem" }}>
          <span className="text-dim">Date:</span>
          <span>{txn.trans_date}</span>
          <span className="text-dim">Total amount:</span>
          <span style={{ color: "var(--success)", fontWeight: 600, fontSize: "1.1rem" }}>
            ₦{txn.deposit.toLocaleString()}
          </span>
          <span className="text-dim">Allocated so far:</span>
          <span>₦{txn.allocated_amount.toLocaleString()}</span>
          <span className="text-dim">Remaining:</span>
          <span style={remaining > 0 ? { color: "var(--warning)", fontWeight: 600 } : {}}>
            ₦{remaining.toLocaleString()}
          </span>
          <span className="text-dim">Description:</span>
          <span>{txn.description}</span>
          <span className="text-dim">Reference:</span>
          <span>{txn.reference || "—"}</span>
          <span className="text-dim">Status:</span>
          <span>{txn.status}</span>
        </div>
      </div>

      {/* ── Existing allocations ─────────────────────── */}
      {allocations.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginBottom: "0.75rem" }}>Current Allocations ({allocations.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Sessions</th>
                <th>Package</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id}>
                  <td>
                    <a href={`/players/${a.player_id}`}>{a.player_name}</a>
                    <span className="text-dim"> ({a.player_code})</span>
                  </td>
                  <td className="text-right">₦{a.amount.toLocaleString()}</td>
                  <td className="text-right">{a.sessions_purchased}</td>
                  <td>{a.package || "—"}</td>
                  <td className="text-dim">{a.notes || ""}</td>
                  <td>
                    <form action={handleRemove} style={{ display: "inline" }}>
                      <input type="hidden" name="alloc_id" value={a.id} />
                      <button type="submit" className="btn btn-sm">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add allocation form ──────────────────────── */}
      {remaining > 0 && txn.status !== "ignored" && (
        <div className="card">
          <h2 style={{ marginBottom: "0.75rem" }}>
            {allocations.length > 0 ? "Add Another Player" : "Assign to Player"}
          </h2>

          {effectiveTariff.packages.length === 0 && (
            <div className="alert alert-warning">
              No tariff packages are configured, so only a custom amount can be entered.
              Add packages in <a href="/settings">Settings → Session Tariffs</a> to get the package picker.
            </div>
          )}
          {effectiveTariff.packages.length > 0 && !effectiveTariff.isCurrent && (
            <div className="alert alert-info">
              No tariff set is dated on or before today — showing the {effectiveTariff.date} set as a fallback.
              Set up a current-dated tariff in <a href="/settings">Settings → Session Tariffs</a>.
            </div>
          )}

          <AllocationForm
            players={players.map((p) => ({ id: p.id, code: p.code, name: p.name, source: p.source }))}
            tariff={effectiveTariff.packages}
            remaining={remaining}
            guessedIds={guessedIds}
            bestGuess={bestGuess}
            kitPrice={KIT_PRICE}
            kitOrdersByPlayer={kitOrdersByPlayer}
            handleAllocate={handleAllocate}
          />
        </div>
      )}

      {remaining <= 0 && txn.status !== "ignored" && (
        <div className="alert alert-success" style={{ textAlign: "center" }}>
          This transaction is fully allocated.
          <div style={{ marginTop: "0.5rem" }}>
            <a href="/bank" className="btn btn-sm">Back to Bank</a>
          </div>
        </div>
      )}
    </>
  );
}
