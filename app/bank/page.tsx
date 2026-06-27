import { requireAuth } from "@/lib/auth";
import {
  getBankTransactions,
  getBankTransactionSummary,
  getBankReconciliation,
  getBankImportBatches,
  previewBatchPurge,
  purgeUnattachedInBatch,
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
  const batchFilter = sp.batch ?? "";
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

      // Duplicate check: date + the bank's running balance (in kobo). Statements
      // here are cumulative, so every upload overlaps the previous ones — the
      // dedup is the control that stops re-importing what's already loaded. The
      // balance is the bank's own figure: identical for a given transaction on
      // every statement and effectively unique per line, so it dedups reliably
      // regardless of how TAJ's concatenated description parses. (Balance was
      // previously avoided because an old parser corrupted some withdrawal-line
      // balances; that parser is fixed and the data has been reconciled end-to-
      // end, so the stored balances are now trustworthy.)
      const existing = getBankTransactions();
      const dedupKey = (t: { trans_date: string; balance: number }) =>
        `${t.trans_date}|${Math.round(t.balance * 100)}`;
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

  const handleBulkPurge = async (formData: FormData) => {
    "use server";
    const batch = (formData.get("batch") as string) || "";
    const cutoff = (formData.get("cutoff") as string) || "";
    if (!batch || !cutoff) {
      redirect("/bank");
    }
    const n = purgeUnattachedInBatch(batch, cutoff);
    redirect(`/bank?batch=${encodeURIComponent(batch)}&success=purged&count=${n}`);
  };

  /* ── Data ────────────────────────────────────────────── */

  const summary = getBankTransactionSummary();
  const recon = getBankReconciliation();
  const batches = getBankImportBatches();
  const activeBatch = batchFilter ? batches.find((b) => b.batch === batchFilter) : null;
  const purgeCutoff = batchFilter ? (sp.purgeBefore ?? "") : "";
  const purgePreview = batchFilter && purgeCutoff ? previewBatchPurge(batchFilter, purgeCutoff) : null;
  const transactions = getBankTransactions({
    status: statusFilter,
    search: search || undefined,
    batch: batchFilter || undefined,
  });

  // Pre-load allocations for each transaction that has them
  const allocsByTxn: Record<number, Array<{ player_id: number; player_name: string; player_code: string; amount: number; sessions_purchased: number }>> = {};
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
      {success === "purged" && (
        <div className="alert alert-success">
          Removed {sp.count} unattached transaction{sp.count === "1" ? "" : "s"} from the import. Clear the filter to see the updated reconciliation.
        </div>
      )}
      {success === "bundled" && (
        <div className="alert alert-success">Payments bundled and allocated.</div>
      )}
      {success === "unbundled" && (
        <div className="alert alert-success">Bundle reversed — those deposits are available to allocate again.</div>
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
          <span className="chip-label">Player payments</span>
        </div>
        <div className="chip">
          <span className="chip-value">{summary.categorised}</span>
          <span className="chip-label">Other (in accounts)</span>
        </div>
        <div className="chip">
          <span className="chip-value">{summary.ignored}</span>
          <span className="chip-label">Set aside</span>
        </div>
        {summary.total_allocated_amount > 0 && (
          <div className="chip">
            <span className="chip-value" style={{ color: "var(--success)", fontSize: "1rem" }}>
              ₦{Math.round(summary.total_allocated_amount).toLocaleString()}
            </span>
            <span className="chip-label">Total player payments</span>
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

      {/* Reconciliation */}
      {recon.hasData && (
        <details className="card" open={!recon.reconciled && !batchFilter} style={{ marginBottom: "1rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Reconciliation:{" "}
            {recon.reconciled ? (
              <span style={{ color: "var(--success)" }}>Reconciled ✓</span>
            ) : (
              <span style={{ color: "var(--danger)" }}>
                Discrepancy ₦{Math.abs(recon.discrepancy).toLocaleString()} · {recon.breaks.length} break{recon.breaks.length === 1 ? "" : "s"}
              </span>
            )}
          </summary>
          <div style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
            <p className="text-dim" style={{ marginBottom: recon.breaks.length > 0 ? "0.75rem" : 0 }}>
              Opening ₦{recon.anchorBalance.toLocaleString()} ({recon.anchorDate}) + net movement{" "}
              ₦{(recon.expectedLatest - recon.anchorBalance).toLocaleString()} = expected{" "}
              ₦{recon.expectedLatest.toLocaleString()}. Latest statement balance{" "}
              ₦{recon.actualLatest.toLocaleString()} ({recon.actualDate}).
            </p>
            {recon.breaks.length > 0 && (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="text-right">Expected balance</th>
                      <th className="text-right">Statement balance</th>
                      <th className="text-right">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recon.breaks.map((b, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: "nowrap" }}>{b.date}</td>
                        <td className="text-right">₦{b.expected.toLocaleString()}</td>
                        <td className="text-right">₦{b.actual.toLocaleString()}</td>
                        <td className="text-right" style={{ color: "var(--danger)", fontWeight: 500 }}>
                          {b.gap > 0 ? "+" : "-"}₦{Math.abs(b.gap).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-dim" style={{ marginTop: "0.5rem" }}>
                  A gap is a balance jump with no transaction to explain it — usually a missing statement, a duplicated import, or a deleted/misread row.
                </p>
              </>
            )}
          </div>
        </details>
      )}

      {/* Import history */}
      {batches.length > 0 && (
        <details className="card" open={!!batchFilter} style={{ marginBottom: "1rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Import history ({batches.length} statement{batches.length === 1 ? "" : "s"})
          </summary>
          <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Imported</th>
                  <th>Period</th>
                  <th className="text-right">Rows</th>
                  <th className="text-right">Net</th>
                  <th className="text-right">Opening</th>
                  <th className="text-right">Closing</th>
                  <th>Continuity</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b, i) => {
                  const prev = i > 0 ? batches[i - 1] : null;
                  const delta = prev ? Math.round((b.opening - prev.closing) * 100) / 100 : 0;
                  const overlaps = prev ? b.firstDate <= prev.lastDate : false;
                  const continuous = prev ? Math.abs(delta) <= 0.01 : true;
                  const isActive = b.batch === batchFilter;
                  return (
                    <tr key={b.batch} style={isActive ? { background: "var(--peach, #fff3e8)" } : {}}>
                      <td style={{ whiteSpace: "nowrap" }}>{b.importedAt ?? "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <a href={`/bank?batch=${encodeURIComponent(b.batch)}`}>{b.firstDate} → {b.lastDate}</a>
                      </td>
                      <td className="text-right">{b.rowCount}</td>
                      <td className="text-right" style={{ color: b.net >= 0 ? "var(--success)" : "var(--danger)" }}>
                        {b.net < 0 ? "-" : ""}₦{Math.abs(b.net).toLocaleString()}
                      </td>
                      <td className="text-right">₦{b.opening.toLocaleString()}</td>
                      <td className="text-right">₦{b.closing.toLocaleString()}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {!prev ? (
                          <span className="text-dim">baseline</span>
                        ) : continuous && !overlaps ? (
                          <span style={{ color: "var(--success)" }}>✓ continues</span>
                        ) : overlaps ? (
                          <span style={{ color: "var(--danger)" }}>overlaps prev</span>
                        ) : (
                          <span style={{ color: "var(--danger)" }}>
                            Δ {delta > 0 ? "+" : "-"}₦{Math.abs(delta).toLocaleString()}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-dim" style={{ marginTop: "0.5rem" }}>
              Each statement&apos;s opening balance should equal the previous statement&apos;s closing. A Δ flag means a missing or duplicated statement between the two; &quot;overlaps prev&quot; means the period was already partly imported.
            </p>
          </div>
        </details>
      )}

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
          {batchFilter && <input type="hidden" name="batch" value={batchFilter} />}
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

      {/* Active batch-filter banner */}
      {batchFilter && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "0.6rem 0.85rem",
            marginBottom: "0.75rem",
            fontSize: "0.9rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <span>
              Showing {transactions.length} row{transactions.length === 1 ? "" : "s"} from one import
              {activeBatch?.importedAt ? ` (imported ${activeBatch.importedAt})` : ""}
              {activeBatch ? ` covering ${activeBatch.firstDate} → ${activeBatch.lastDate}` : ""}.
            </span>
            <a href="/bank" className="btn btn-sm">Clear filter</a>
          </div>

          {!purgePreview ? (
            <form
              method="GET"
              action="/bank"
              style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}
            >
              <input type="hidden" name="batch" value={batchFilter} />
              <span className="text-dim">Remove unattached rows in this import dated on or before</span>
              <input type="date" name="purgeBefore" defaultValue={purgeCutoff} required />
              <button type="submit" className="btn btn-sm">Preview removal</button>
            </form>
          ) : (
            <div style={{ marginTop: "0.6rem", borderTop: "1px solid var(--border)", paddingTop: "0.6rem" }}>
              {purgePreview.deletableCount === 0 ? (
                <p style={{ margin: 0 }}>
                  No unattached rows dated on or before {purgeCutoff} in this import.
                  {purgePreview.skippedCount > 0 && ` (${purgePreview.skippedCount} attached row${purgePreview.skippedCount === 1 ? "" : "s"} would be kept.)`}{" "}
                  <a href={`/bank?batch=${encodeURIComponent(batchFilter)}`}>Cancel</a>
                </p>
              ) : (
                <>
                  <p style={{ margin: "0 0 0.4rem" }}>
                    <strong style={{ color: "var(--danger)" }}>Confirm removal.</strong>{" "}
                    This will permanently delete <strong>{purgePreview.deletableCount}</strong> unattached row
                    {purgePreview.deletableCount === 1 ? "" : "s"} dated on or before {purgeCutoff} (removing ₦
                    {purgePreview.removeDeposits.toLocaleString()} of deposits and ₦
                    {purgePreview.removeWithdrawals.toLocaleString()} of withdrawals).
                    {purgePreview.skippedCount > 0 &&
                      ` ${purgePreview.skippedCount} attached row${purgePreview.skippedCount === 1 ? "" : "s"} will be kept:`}
                  </p>
                  {purgePreview.skipped.length > 0 && (
                    <ul className="text-dim" style={{ margin: "0 0 0.5rem", paddingLeft: "1.2rem" }}>
                      {purgePreview.skipped.map((s) => (
                        <li key={s.id}>{s.trans_date} — {s.description} ({s.reason})</li>
                      ))}
                    </ul>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <form action={handleBulkPurge} style={{ display: "inline" }}>
                      <input type="hidden" name="batch" value={batchFilter} />
                      <input type="hidden" name="cutoff" value={purgeCutoff} />
                      <button type="submit" className="btn btn-sm btn-danger">
                        Delete {purgePreview.deletableCount} row{purgePreview.deletableCount === 1 ? "" : "s"}
                      </button>
                    </form>
                    <a href={`/bank?batch=${encodeURIComponent(batchFilter)}`} className="btn btn-sm">Cancel</a>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bundle toolbar (detached form so row action-forms aren't nested) */}
      <form id="bundleForm" method="GET" action="/bank/bundle"></form>
      <div style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="submit" form="bundleForm" className="btn btn-sm">Bundle selected deposits →</button>
        <span className="text-dim" style={{ fontSize: "0.85rem" }}>
          Tick two or more deposits below to combine them into one payment and allocate the total.
        </span>
      </div>

      {/* Transaction table */}
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th></th>
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
                <td colSpan={8} className="text-center text-dim" style={{ padding: "2rem" }}>
                  No transactions found. Upload a bank statement PDF to get started.
                </td>
              </tr>
            )}
            {transactions.map((t) => {
              const allocs = allocsByTxn[t.id] || [];
              const splits = splitsByTxn[t.id] ?? [];
              const remaining = t.deposit - t.allocated_amount;
              // A transaction can be hard-deleted only if nothing is attached
              // to it — no player allocations, no expense splits.
              const canDelete = allocs.length === 0 && splits.length === 0;

              // "ignored" status means "not a player payment" — but the txn may
              // still have been categorised into expense/other-income via splits.
              // Distinguish those two cases in the pill so the table doesn't
              // mislabel categorised transactions as just "ignored".
              const isCategorised = t.status === "ignored" && splits.length > 0;
              const statusLabel =
                t.status === "partial" ? "partial" :
                isCategorised           ? "categorised" :
                t.status;
              const statusPillClass =
                t.status === "allocated" ? "pill pill-success" :
                t.status === "partial"   ? "pill pill-warning" :
                isCategorised            ? "pill pill-success" :
                t.status === "ignored"   ? "pill pill-muted" :
                                           "pill pill-warning";

              return (
                <tr key={t.id}>
                  <td style={{ textAlign: "center" }}>
                    {(t.status === "unallocated" || t.status === "partial") && t.deposit > 0 && (
                      <input type="checkbox" name="ids" value={t.id} form="bundleForm" aria-label="Select deposit to bundle" />
                    )}
                  </td>
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
                    <span className={statusPillClass}>{statusLabel}</span>
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
                    {t.status === "unallocated" && t.deposit === 0 && t.withdrawal > 0 && (
                      <a href={`/bank/${t.id}/categorise`} className="btn btn-sm btn-primary">
                        Categorise
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
