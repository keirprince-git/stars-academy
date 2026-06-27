import { requireAuth } from "@/lib/auth";
import {
  getBankTransaction,
  getTransactionSplits,
  setTransactionSplits,
  clearTransactionSplits,
  getCategorisedStamp,
  type TransactionSplitInput,
} from "@/lib/db";
import { getAllCategories, getCategoryLabel } from "@/lib/categories";
import { redirect } from "next/navigation";

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

  /* ── Server actions ──────────────────────────────────── */

  const handleSave = async (formData: FormData) => {
    "use server";

    const lines: TransactionSplitInput[] = [];
    let i = 0;
    while (formData.has(`category_${i}`)) {
      const category = (formData.get(`category_${i}`) as string).trim();
      const amountRaw = formData.get(`amount_${i}`) as string;
      const notes = ((formData.get(`notes_${i}`) as string) || "").trim() || null;
      const amount = parseFloat(amountRaw);
      if (category && !isNaN(amount) && amount > 0) {
        lines.push({ category, amount, notes });
      }
      i++;
    }

    if (lines.length === 0) {
      redirect(`/bank/${txnId}/categorise?error=empty`);
    }

    // Validate sum matches transaction total within 1 kobo (₦0.01) tolerance.
    const sum = lines.reduce((s, l) => s + l.amount, 0);
    if (Math.abs(sum - totalAmount) > 0.01) {
      redirect(`/bank/${txnId}/categorise?error=sum_mismatch&sum=${encodeURIComponent(sum.toFixed(2))}`);
    }

    try {
      setTransactionSplits(txnId, lines, auth.userId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      redirect(`/bank/${txnId}/categorise?error=${encodeURIComponent(msg)}`);
    }
    redirect("/bank?success=categorised");
  };

  const handleClear = async () => {
    "use server";
    clearTransactionSplits(txnId, auth.userId);
    redirect(`/bank/${txnId}/categorise?success=cleared`);
  };

  // Pre-fill form rows: existing splits, or one empty row, or one row with the full amount if uncategorised.
  const initialRows: Array<{ category: string; amount: number | ""; notes: string }> =
    splits.length > 0
      ? splits.map(s => ({ category: s.category, amount: s.amount, notes: s.notes ?? "" }))
      : [{ category: "", amount: totalAmount, notes: "" }];

  // Pad to a few empty rows so the user can add lines without JS first.
  while (initialRows.length < 4) {
    initialRows.push({ category: "", amount: "", notes: "" });
  }

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

        <form action={handleSave} id="splitForm">
          <table style={{ marginBottom: "0.75rem" }}>
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Category</th>
                <th className="text-right" style={{ width: "20%" }}>Amount (₦)</th>
                <th>Notes (optional)</th>
              </tr>
            </thead>
            <tbody id="splitRows">
              {initialRows.map((row, i) => (
                <tr key={i} data-split-row>
                  <td>
                    <select name={`category_${i}`} defaultValue={row.category} style={{ width: "100%" }}>
                      <option value="">— Select category —</option>
                      {categoriesForDirection.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="text-right">
                    <input
                      name={`amount_${i}`}
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={row.amount === "" ? "" : row.amount}
                      data-split-amount
                      style={{ width: "100%", textAlign: "right" }}
                    />
                  </td>
                  <td>
                    <input
                      name={`notes_${i}`}
                      type="text"
                      defaultValue={row.notes}
                      placeholder="e.g. boots component"
                      style={{ width: "100%" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 600 }}>
                <td className="text-right">Sum of splits:</td>
                <td className="text-right" id="splitSumCell">
                  ₦<span id="splitSum">0</span>
                </td>
                <td id="splitDiff" className="text-dim"></td>
              </tr>
              <tr style={{ fontWeight: 600 }}>
                <td className="text-right">Transaction total:</td>
                <td className="text-right">₦{totalAmount.toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="submit" className="btn btn-primary">Save Splits</button>
            <a href="/bank" className="btn">Cancel</a>
            {splits.length > 0 && (
              <button type="submit" formAction={handleClear} className="btn" style={{ marginLeft: "auto", color: "var(--danger)" }}>
                Clear All Splits
              </button>
            )}
          </div>

          {splits.length > 0 && (
            <p className="text-dim" style={{ fontSize: "0.8rem", marginTop: "0.75rem" }}>
              Currently split into: {splits.map(s => `${getCategoryLabel(s.category)} ₦${s.amount.toLocaleString()}`).join(" · ")}
            </p>
          )}
        </form>
      </div>

      {/* Live sum + auto-fill last row to balance */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          var total = ${totalAmount};
          var rows = document.querySelectorAll('[data-split-row]');
          var inputs = document.querySelectorAll('[data-split-amount]');
          var sumEl = document.getElementById('splitSum');
          var diffEl = document.getElementById('splitDiff');

          function fmt(n) { return n.toLocaleString('en-US', {maximumFractionDigits: 2}); }

          function recalc() {
            var sum = 0;
            inputs.forEach(function(el) {
              var v = parseFloat(el.value);
              if (!isNaN(v)) sum += v;
            });
            sumEl.textContent = fmt(Math.round(sum * 100) / 100);
            var diff = Math.round((total - sum) * 100) / 100;
            if (Math.abs(diff) < 0.01) {
              diffEl.textContent = '✓ matches total';
              diffEl.style.color = 'var(--success)';
            } else if (diff > 0) {
              diffEl.textContent = '₦' + fmt(diff) + ' under';
              diffEl.style.color = 'var(--warning)';
            } else {
              diffEl.textContent = '₦' + fmt(-diff) + ' over';
              diffEl.style.color = 'var(--danger)';
            }
          }

          inputs.forEach(function(el) { el.addEventListener('input', recalc); });
          recalc();
        })();
      `}} />
    </>
  );
}
