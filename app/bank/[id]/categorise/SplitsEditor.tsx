"use client";

import { useState } from "react";

interface Cat {
  value: string;
  label: string;
}
interface Row {
  category: string;
  amount: string;
  notes: string;
}

/**
 * Interactive splits editor. Add as many category lines as needed (no fixed
 * limit) and see a live running total that always works (computed from React
 * state, not an inline script). Submits to the top-level save/clear server
 * actions via the form fields category_i / amount_i / notes_i + a hidden txn_id.
 */
export default function SplitsEditor({
  txnId,
  totalAmount,
  categories,
  initialRows,
  hasSplits,
  saveAction,
  clearAction,
}: {
  txnId: number;
  totalAmount: number;
  categories: Cat[];
  initialRows: Row[];
  hasSplits: boolean;
  saveAction: (formData: FormData) => Promise<void>;
  clearAction: (formData: FormData) => Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>(
    initialRows.length > 0 ? initialRows : [{ category: "", amount: "", notes: "" }]
  );

  const update = (i: number, field: keyof Row, val: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [field]: val } : r)));
  const addRow = () => setRows((rs) => [...rs, { category: "", amount: "", notes: "" }]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  const sum = Math.round(rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0) * 100) / 100;
  const diff = Math.round((totalAmount - sum) * 100) / 100;
  const ok = Math.abs(diff) < 0.01;
  const diffColor = ok ? "var(--success)" : diff > 0 ? "var(--warning)" : "var(--danger)";

  return (
    <form action={saveAction}>
      <input type="hidden" name="txn_id" value={txnId} />
      <table style={{ marginBottom: "0.75rem" }}>
        <thead>
          <tr>
            <th style={{ width: "38%" }}>Category</th>
            <th className="text-right" style={{ width: "20%" }}>Amount (₦)</th>
            <th>Notes (optional)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <select
                  name={`category_${i}`}
                  value={row.category}
                  onChange={(e) => update(i, "category", e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">— Select category —</option>
                  {categories.map((c) => (
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
                  value={row.amount}
                  onChange={(e) => update(i, "amount", e.target.value)}
                  style={{ width: "100%", textAlign: "right" }}
                />
              </td>
              <td>
                <input
                  name={`notes_${i}`}
                  type="text"
                  value={row.notes}
                  onChange={(e) => update(i, "notes", e.target.value)}
                  placeholder="e.g. boots component"
                  style={{ width: "100%" }}
                />
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                {rows.length > 1 && (
                  <button type="button" onClick={() => removeRow(i)} className="btn btn-sm" title="Remove this line">✕</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 600 }}>
            <td className="text-right">Sum of splits:</td>
            <td className="text-right">₦{sum.toLocaleString()}</td>
            <td style={{ color: diffColor }}>
              {ok ? "✓ matches total" : diff > 0 ? `₦${Math.abs(diff).toLocaleString()} under` : `₦${Math.abs(diff).toLocaleString()} over`}
            </td>
            <td></td>
          </tr>
          <tr style={{ fontWeight: 600 }}>
            <td className="text-right">Transaction total:</td>
            <td className="text-right">₦{totalAmount.toLocaleString()}</td>
            <td></td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div style={{ marginBottom: "0.75rem" }}>
        <button type="button" onClick={addRow} className="btn btn-sm">+ Add another category</button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" className="btn btn-primary">Save Splits</button>
        <a href="/bank" className="btn">Cancel</a>
        {hasSplits && (
          <button type="submit" formAction={clearAction} className="btn" style={{ marginLeft: "auto", color: "var(--danger)" }}>
            Clear All Splits
          </button>
        )}
      </div>
    </form>
  );
}
