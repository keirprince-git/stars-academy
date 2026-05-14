import { requireAuth } from "@/lib/auth";
import {
  getBankTransactions,
  getBankTransactionSummary,
  insertBankTransactions,
  ignoreBankTransaction,
  restoreBankTransaction,
  deleteBankTransaction,
  getBankAllocations,
  getSplitsByTxnIds,
  type TransactionSplit,
} from "@/lib/db";
import { getCategoryLabel } from "@/lib/categories";
import { parseBankStatementText } from "@/lib/parse-bank-pdf";
import { redirect } from "next/navigation";
import crypto from "crypto";

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  if (auth.role !== "admin") {
    return <p className="error-msg">Only admins can access bank transactions.</p>;
  }

  const sp = await searchParams;
  const statusFilter = sp.status ?? "all";
  const search = sp.search ?? "";
  const success = sp.success;
  const error = sp.error;

  /* ── Server actions ──────────────────────────────────── */

  const handleUpload = async (formData: FormData) => {
    "use server";
    const file = formData.get("pdf_file") as File | null;
    if (!file || file.size === 0) {
      redirect("/bank?error=no_file");
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const pdfParse = (await import("pdf-parse")).default;
      const pdf = await pdfParse(buffer);
      const result = parseBankStatementText(pdf.text);

      if (result.transactions.length === 0) {
        redirect("/bank?error=no_transactions");
      }

      const batch = `import-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

      // Duplicate check: date + deposit + withdrawal + description. The balance
      // figure is deliberately NOT used — an earlier parser version stored
      // corrupted balances for withdrawal lines, which made balance-based dedup
      // miss re-imported withdrawals. These four fields parse consistently.
      const existing = getBankTransactions();
      const dedupKey = (t: { trans_date: string; deposit: number; withdrawal: number; description: string }) =>
        `${t.trans_date}|${t.deposit}|${t.withdrawal}|${t.description}`;
      const existingKeys = new Set(existing.map(dedupKey));
      const newTxns = result.transactions.filter((t) => !existingKeys.has(dedupKey(t)));

      if (newTxns.length === 0) {
        redirect("/bank?error=all_duplicates");
      }

      insertBankTransactions(newTxns, batch);
      redirect(
        `/bank?success=imported&count=${newTxns.length}&total=${result.transactions.length}&skipped=${result.transactions.length - newTxns.length}`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      redirect(`/bank?error=parse_failed&msg=${encodeURIComponent(msg)}`);
    }
  };

  const handleIgnore = async (formData: FormData) => {
    "use server";
    const txnId = parseInt(formData.get("txn_id") as string, 10);
    ignoreBankTransaction(txnId, "Not a player payment");
    redirect("/bank?success=ignored");
  };

  const handleRestore = async (formData: FormData) => {
    "use server";
    const txnId = parseInt(formData.get("txn_id") as string, 10);
    restoreBankTransaction(txnId);
    redirect("/bank?success=restored");
  };

  const handleDelete = async (formData: FormData) => {
    "use server";
    const txnId = parseInt(formData.get("txn_id") as string, 10);
    try {
      deleteBankTransaction(txnId);
      redirect("/bank?success=deleted");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      redirect(`/bank?error=${encodeURIComponent(msg)}`);
    }
  };

  /* ── Data ────────────────────────────────────────────── */

  const summary = getBankTransactionSummary();
  const transactions = getBankTransactions({
    status: statusFilter,
    search: search || undefined,
  });

  // Pre-load allocations for each transaction that has them
  const allocsByTxn: Record<number, Array<{ player_name: string; player_code: string; amount: number; sessions_purchased: number }>> = {};
  for (const t of transactions) {
    if (t.status === "allocated" || t.status === "partial") {
      allocsByTxn[t.id] = getBankAllocations(t.id);
    }
  }

  // Pre-load splits for all visible transactions in one query
  const splitsByTxn: Record<number, TransactionSplit[]> = getSplitsByTxnIds(transactions.map(t => t.id));

  /* ── Render ──────────────────────────────────────────── */

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Bank Transactions</h2>
      </div>

      {/* Messages */}
      {success === "imported" && (
        <div className="alert alert-success">
          Imported {sp.count} transactions ({sp.skipped !== "0" ? `${sp.skipped} duplicates skipped` : "no duplicates"}).
        </div>
      )}
      {(success === "ignored" || success === "restored" || success === "allocated" || success === "categorised" || success === "deleted") && (
        <div className="alert alert-success">
          {success === "ignored" ? "Transaction ignored."
            : success === "restored" ? "Transaction restored."
            : success === "categorised" ? "Category updated."
            : success === "deleted" ? "Transaction deleted."
            : "Payment allocated."}
        </div>
      )}
      {error === "no_file" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Please select a PDF file.</div>
      )}
      {error === "no_transactions" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>No transactions found in the PDF.</div>
      )}
      {error === "all_duplicates" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>All transactions already exist.</div>
      )}
      {error === "parse_failed" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Parse error: {sp.msg}</div>
      )}
      {error && !["no_file", "no_transactions", "all_duplicates", "parse_failed"].includes(error) && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>{decodeURIComponent(error)}</div>
      )}

      {/* Summary */}
      <div className="summary-row">
        <div className="chip">
          <span className="chip-value">{summary.total}</span>
          <span className="chip-label">Total</span>
        </div>
        <div className="chip" style={summary.unallocated > 0 ? { borderColor: "var(--warning)" } : {}}>
          <span className="chip-value" style={summary.unallocated > 0 ? { color: "var(--warning)" } : {}}>{summary.unallocated}</span>
          <span className="chip-label">Needs action</span>
        </div>
        <div className="chip">
          <span className="chip-value">{summary.allocated}</span>
          <span className="chip-label">Allocated</span>
        </div>
        <div className="chip">
          <span className="chip-value">{summary.ignored}</span>
          <span className="chip-label">Ignored</span>
        </div>
        {summary.total_allocated_amount > 0 && (
          <div className="chip">
            <span className="chip-value" style={{ color: "var(--success)", fontSize: "1rem" }}>
              ₦{Math.round(summary.total_allocated_amount).toLocaleString()}
            </span>
            <span className="chip-label">Total allocated</span>
          </div>
        )}
        {summary.unallocated_amount > 0 && (
          <div className="chip" style={{ borderColor: "var(--warning)" }}>
            <span className="chip-value" style={{ color: "var(--warning)", fontSize: "1rem" }}>
              ₦{Math.round(summary.unallocated_amount).toLocaleString()}
            </span>
            <span className="chip-label">Unallocated deposits</span>
          </div>
        )}
        {summary.latest_balance !== null && (
          <div className="chip">
            <span className="chip-value" style={{ fontSize: "1rem" }}>
              ₦{summary.latest_balance.toLocaleString()}
            </span>
            <span className="chip-label">Bank balance ({summary.latest_date})</span>
          </div>
        )}
      </div>

      {/* Upload */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.5rem" }}>Import Bank Statement</h2>
        <form action={handleUpload} encType="multipart/form-data">
          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="pdf_file">TAJ Bank PDF Statement</label>
              <input id="pdf_file" name="pdf_file" type="file" accept=".pdf" required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginBottom: "0.25rem" }}>
              Upload &amp; Import
            </button>
          </div>
        </form>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <form method="GET" action="/bank">
          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={statusFilter}>
                <option value="all">All</option>
                <option value="unallocated">Needs action</option>
                <option value="allocated">Allocated</option>
                <option value="ignored">Ignored</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="search">Search</label>
              <input id="search" name="search" type="text" placeholder="Description or reference..." defaultValue={search} />
            </div>
            <button type="submit" className="btn" style={{ marginBottom: "0.25rem" }}>Filter</button>
          </div>
        </form>
      </div>

      {/* Transaction table */}
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th className="text-right">Deposit</th>
              <th className="text-right">Withdrawal</th>
              <th>Status</th>
              <th>Allocated to</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-dim" style={{ padding: "2rem" }}>
                  No transactions found. Upload a bank statement PDF to get started.
                </td>
              </tr>
            )}
            {transactions.map((t) => {
              const allocs = allocsByTxn[t.id] || [];
              const splits = splitsByTxn[t.id] ?? [];
              const statusLabel = t.status === "partial" ? "partial" : t.status;
              const remaining = t.deposit - t.allocated_amount;
              // A transaction can be hard-deleted only if nothing is attached
              // to it — no player allocations, no expense splits.
              const canDelete = allocs.length === 0 && splits.length === 0;

              return (
                <tr key={t.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{t.trans_date}</td>
                  <td style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis" }} title={t.description}>
                    {t.description}
                  </td>
                  <td className="text-right" style={t.deposit > 0 ? { color: "var(--success)", fontWeight: 500 } : {}}>
                    {t.deposit > 0 ? `₦${t.deposit.toLocaleString()}` : ""}
                  </td>
                  <td className="text-right" style={t.withdrawal > 0 ? { color: "var(--danger)" } : {}}>
                    {t.withdrawal > 0 ? `₦${t.withdrawal.toLocaleString()}` : ""}
                  </td>
                  <td>
                    <span className={
                      t.status === "allocated" ? "pill pill-success" :
                      t.status === "partial"   ? "pill pill-warning" :
                      t.status === "ignored"   ? "pill pill-muted" :
                                                 "pill pill-warning"
                    }>
                      {statusLabel}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>
                    {allocs.length > 0 && (
                      <div>
                        {allocs.map((a, i) => (
                          <div key={i}>
                            <a href={`/players/${a.player_id}`}>{a.player_name}</a>
                            <span className="text-dim"> ({a.player_code}) — ₦{a.amount.toLocaleString()}, {a.sessions_purchased}s</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(splitsByTxn[t.id] ?? []).length > 0 && (
                      <div>
                        {splitsByTxn[t.id].map((s, i) => (
                          <div key={i}>
                            <span>{getCategoryLabel(s.category)}</span>
                            <span className="text-dim"> — ₦{s.amount.toLocaleString()}{s.notes ? ` · ${s.notes}` : ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {(t.status === "unallocated" || t.status === "partial") && t.deposit > 0 && (
                      <a href={`/bank/${t.id}/allocate`} className="btn btn-sm btn-primary">
                        {t.status === "partial" ? `+Add (₦${Math.round(remaining).toLocaleString()})` : "Allocate"}
                      </a>
                    )}
                    {t.status === "unallocated" && (
                      <form action={handleIgnore} style={{ display: "inline" }}>
                        <input type="hidden" name="txn_id" value={t.id} />
                        <button type="submit" className="btn btn-sm" style={{ marginLeft: "4px" }}>
                          Ignore
                        </button>
                      </form>
                    )}
                    {(t.status === "allocated" || t.status === "partial") && (
                      <a href={`/bank/${t.id}/allocate`} className="btn btn-sm" style={{ marginLeft: "4px" }}>
                        View
                      </a>
                    )}
                    {t.status === "ignored" && (
                      <>
                        <a href={`/bank/${t.id}/categorise`} className={`btn btn-sm ${splits.length === 0 ? "btn-primary" : ""}`} style={{ marginLeft: "4px" }}>
                          {splits.length === 0 ? "Categorise" : "Edit splits"}
                        </a>
                        <form action={handleRestore} style={{ display: "inline" }}>
                          <input type="hidden" name="txn_id" value={t.id} />
                          <button type="submit" className="btn btn-sm" style={{ marginLeft: "4px" }}>
                            Restore
                          </button>
                        </form>
                      </>
                    )}
                    {canDelete && (
                      <form action={handleDelete} style={{ display: "inline" }}>
                        <input type="hidden" name="txn_id" value={t.id} />
                        <button type="submit" className="btn btn-sm btn-danger" style={{ marginLeft: "4px" }}>
                          Delete
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
