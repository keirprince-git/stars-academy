import { requireAuth } from "@/lib/auth";
import {
  getBankTransaction,
  getTransactionSplits,
  getCategorisedStamp,
} from "@/lib/db";
import { getAllCategories } from "@/lib/categories";
import { saveSplitsAction, clearSplitsAction } from "./actions";
import SplitsEditor from "./SplitsEditor";

export default async function CategorisePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  if (auth.role !== "admin") {
    return <p className="error-msg">Only admins can categorise transactions.</p>;
  }

  const { id } = await params;
  const sp = await searchParams;
  const txnId = parseInt(id, 10);
  const txn = getBankTransaction(txnId);

  if (!txn) {
    return <p className="error-msg">Transaction not found.</p>;
  }

  const isIncome = txn.deposit > 0;
  const totalAmount = isIncome ? txn.deposit : txn.withdrawal;
  const direction = isIncome ? "income" : "expense";

  const allCategories = getAllCategories();
  const categoriesForDirection = allCategories.filter(c => c.type === direction);
  const splits = getTransactionSplits(txnId);
  const stamp = getCategorisedStamp(txnId);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Categorise Transaction</h2>
        <a href="/bank" className="btn btn-sm">Back to Bank</a>
      </div>

      {sp.success === "cleared" && (
        <div className="alert alert-success">Splits cleared. The transaction is no longer categorised.</div>
      )}
      {sp.error === "empty" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Add at least one category line, or use Clear.</div>
      )}
      {sp.error === "sum_mismatch" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>
          The split lines sum to ₦{sp.sum} but the transaction total is ₦{totalAmount.toLocaleString()}. They must match exactly.
        </div>
      )}
      {sp.error && !["empty", "sum_mismatch"].includes(sp.error) && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>{decodeURIComponent(sp.error)}</div>
      )}

      {/* ── Transaction summary ──────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>Transaction Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.4rem 1rem", fontSize: "0.9rem" }}>
          <span className="text-dim">Date:</span>
          <span>{txn.trans_date}</span>
          <span className="text-dim">Description:</span>
          <span>{txn.description}</span>
          <span className="text-dim">Reference:</span>
          <span>{txn.reference || "—"}</span>
          <span className="text-dim">Direction:</span>
          <span>{isIncome ? "Income (deposit)" : "Expense (withdrawal)"}</span>
          <span className="text-dim">Total amount:</span>
          <span style={{
            color: isIncome ? "var(--success)" : "var(--danger)",
            fontWeight: 600, fontSize: "1.1rem",
          }}>
            ₦{totalAmount.toLocaleString()}
          </span>
          {stamp.categorised_at && (
            <>
              <span className="text-dim">Last categorised:</span>
              <span className="text-dim" style={{ fontSize: "0.85rem" }}>
                {stamp.categorised_at}{stamp.username ? ` by ${stamp.username}` : ""}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Splits editor ──────────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>{splits.length > 0 ? "Edit Splits" : "Categorise"}</h2>
        <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          Break this transaction across one or more {direction} categories. The split amounts must sum to the total.
        </p>

        <SplitsEditor
          txnId={txnId}
          totalAmount={totalAmount}
          categories={categoriesForDirection.map((c) => ({ value: c.value, label: c.label }))}
          initialRows={
            splits.length > 0
              ? splits.map((s) => ({ category: s.category, amount: String(s.amount), notes: s.notes ?? "" }))
              : [{ category: "", amount: String(totalAmount), notes: "" }]
          }
          hasSplits={splits.length > 0}
          saveAction={saveSplitsAction}
          clearAction={clearSplitsAction}
        />
      </div>
    </>
  );
}
