import { requireAuth } from "@/lib/auth";
import {
  getBankTransactions,
  getBankTransactionSummary,
  insertBankTransactions,
  ignoreBankTransaction,
  restoreBankTransaction,
  getBankAllocations,
  setCategoryForTransaction,
} from "@/lib/db";
import { getAllCategories } from "@/lib/categories";
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

      // Duplicate check: same date + balance
      const existing = getBankTransactions();
      const existingKeys = new Set(
        existing.map((t) => `${t.trans_date}|${t.balance}`)
      );
      const newTxns = result.transactions.filter(
        (t) => !existingKeys.has(`${t.trans_date}|${t.balance}`)
      );

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

  const handleCategorise = async (formData: FormData) => {
    "use server";
    const txnId = parseInt(formData.get("txn_id") as string, 10);
    const category = (formData.get("category") as string) || null;
    setCategoryForTransaction(txnId, category);
    redirect("/bank?success=categorised");
  };

  /* ── Data ────────────────────────────────────────────── */

  const categories = getAllCategories();
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

  /* ── Render ──────────────────────────────────────────── */

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Bank Transactions</h2>
      </div>

      {/* Messages */}
      {success === "imported" && (
        <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          Imported {sp.count} transactions ({sp.skipped !== "0" ? `${sp.skipped} duplicates skipped` : "no duplicates"}).
        </div>
      )}
      {(success === "ignored" || success === "restored" || success === "allocated" || success === "categorised") && (
        <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          {success === "ignored" ? "Transaction ignored." : success === "restored" ? "Transaction restored." : success === "categorised" ? "Category updated." : "Payment allocated."}
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

      {/* Summary */}
      <div className="summary-row">
        <div className="chip">
          <span className="chip-value">{summary.total}</span>
          <span className="chip-label">Total</span>
        </div>
        <div className="chip" style={summary.unallocated > 0 ? { borderColor: "#e67700" } : {}}>
          <span className="chip-value" style={summary.unallocated > 0 ? { color: "#e67700" } : {}}>{summary.unallocated}</span>
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
            <span className="chip-value" style={{ color: "#2f9e44", fontSize: "1rem" }}>
              ₦{Math.round(summary.total_allocated_amount).toLocaleString()}
            </span>
            <span className="chip-label">Total allocated</span>
          </div>
        )}
        {summary.unallocated_amount > 0 && (
          <div className="chip" style={{ borderColor: "#e67700" }}>
            <span className="chip-value" style={{ color: "#e67700", fontSize: "1rem" }}>
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
              const statusLabel = t.status === "partial" ? "partial" : t.status;
              const remaining = t.deposit - t.allocated_amount;

              return (
                <tr key={t.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{t.trans_date}</td>
                  <td style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis" }} title={t.description}>
                    {t.description}
                  </td>
                  <td className="text-right" style={t.deposit > 0 ? { color: "#2f9e44", fontWeight: 500 } : {}}>
                    {t.deposit > 0 ? `₦${t.deposit.toLocaleString()}` : ""}
                  </td>
                  <td className="text-right" style={t.withdrawal > 0 ? { color: "#c92a2a" } : {}}>
                    {t.withdrawal > 0 ? `₦${t.withdrawal.toLocaleString()}` : ""}
                  </td>
                  <td>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      background:
                        t.status === "allocated" ? "#d1e7dd" :
                        t.status === "partial" ? "#fff3cd" :
                        t.status === "ignored" ? "#e9ecef" : "#fff3cd",
                      color:
                        t.status === "allocated" ? "#0f5132" :
                        t.status === "partial" ? "#664d03" :
                        t.status === "ignored" ? "#6c757d" : "#664d03",
                    }}>
                      {statusLabel}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>
                    {allocs.length > 0 ? (
                      <div>
                        {allocs.map((a, i) => (
                          <div key={i}>
                            <a href={`/players/${a.player_id}`}>{a.player_name}</a>
                            <span className="text-dim"> ({a.player_code}) — ₦{a.amount.toLocaleString()}, {a.sessions_purchased}s</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {t.status === "ignored" && (
                      <form action={handleCategorise} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <input type="hidden" name="txn_id" value={t.id} />
                        <select name="category" defaultValue={t.category ?? ""} style={{ fontSize: "0.8rem", padding: "2px 4px", maxWidth: "140px" }}>
                          <option value="">— Category —</option>
                          {categories.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                        <button type="submit" className="btn btn-sm" style={{ padding: "2px 6px", fontSize: "0.75rem" }}>Set</button>
                      </form>
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
                      <form action={handleRestore} style={{ display: "inline" }}>
                        <input type="hidden" name="txn_id" value={t.id} />
                        <button type="submit" className="btn btn-sm" style={{ marginLeft: "4px" }}>
                          Restore
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
