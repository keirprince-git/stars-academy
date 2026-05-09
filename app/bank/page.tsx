import { requireAuth } from "@/lib/auth";
import {
  getBankTransactions,
  getBankTransactionSummary,
  insertBankTransactions,
  ignoreBankTransaction,
  unallocateBankTransaction,
} from "@/lib/db";
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
      // Read PDF buffer
      const buffer = Buffer.from(await file.arrayBuffer());

      // Parse with pdf-parse
      const pdfParse = (await import("pdf-parse")).default;
      const pdf = await pdfParse(buffer);

      // Parse TAJ Bank format
      const result = parseBankStatementText(pdf.text);

      if (result.transactions.length === 0) {
        redirect("/bank?error=no_transactions");
      }

      // Generate a unique batch ID
      const batch = `import-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

      // Check for duplicates: if a transaction with same date+balance already exists, skip it
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
      if (msg.includes("NEXT_REDIRECT")) throw e; // re-throw Next.js redirects
      redirect(`/bank?error=parse_failed&msg=${encodeURIComponent(msg)}`);
    }
  };

  const handleIgnore = async (formData: FormData) => {
    "use server";
    const txnId = parseInt(formData.get("txn_id") as string, 10);
    const reason = (formData.get("reason") as string) || null;
    ignoreBankTransaction(txnId, reason);
    redirect("/bank?success=ignored");
  };

  const handleUnallocate = async (formData: FormData) => {
    "use server";
    const txnId = parseInt(formData.get("txn_id") as string, 10);
    unallocateBankTransaction(txnId);
    redirect("/bank?success=unallocated");
  };

  /* ── Data ────────────────────────────────────────────── */

  const summary = getBankTransactionSummary();
  const transactions = getBankTransactions({
    status: statusFilter,
    search: search || undefined,
  });

  /* ── Render ──────────────────────────────────────────── */

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Bank Transactions</h2>
      </div>

      {/* ── Messages ─────────────────────────────────── */}
      {success === "imported" && (
        <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          Imported {sp.count} transactions ({sp.skipped !== "0" ? `${sp.skipped} duplicates skipped` : "no duplicates"}).
        </div>
      )}
      {success === "ignored" && (
        <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          Transaction marked as ignored.
        </div>
      )}
      {success === "unallocated" && (
        <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          Allocation reversed.
        </div>
      )}
      {error === "no_file" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Please select a PDF file to upload.</div>
      )}
      {error === "no_transactions" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>No transactions found in the PDF. Is it a TAJ Bank statement?</div>
      )}
      {error === "all_duplicates" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>All transactions in this PDF already exist in the database.</div>
      )}
      {error === "parse_failed" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Failed to parse PDF: {sp.msg}</div>
      )}

      {/* ── Summary chips ────────────────────────────── */}
      <div className="summary-row">
        <div className="chip">
          <span className="chip-value">{summary.total}</span>
          <span className="chip-label">Total</span>
        </div>
        <div className="chip" style={summary.unallocated > 0 ? { borderColor: "#e67700" } : {}}>
          <span className="chip-value" style={summary.unallocated > 0 ? { color: "#e67700" } : {}}>{summary.unallocated}</span>
          <span className="chip-label">Unallocated</span>
        </div>
        <div className="chip">
          <span className="chip-value">{summary.allocated}</span>
          <span className="chip-label">Allocated</span>
        </div>
        <div className="chip">
          <span className="chip-value">{summary.ignored}</span>
          <span className="chip-label">Ignored</span>
        </div>
        {summary.unallocated_amount > 0 && (
          <div className="chip" style={{ borderColor: "#e67700" }}>
            <span className="chip-value" style={{ color: "#e67700", fontSize: "1rem" }}>
              ₦{summary.unallocated_amount.toLocaleString()}
            </span>
            <span className="chip-label">Unallocated deposits</span>
          </div>
        )}
      </div>

      {/* ── Upload card ──────────────────────────────── */}
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

      {/* ── Filters ──────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <form method="GET" action="/bank">
          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={statusFilter}>
                <option value="all">All</option>
                <option value="unallocated">Unallocated</option>
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

      {/* ── Transaction table ────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th className="text-right">Deposit</th>
              <th className="text-right">Withdrawal</th>
              <th>Status</th>
              <th>Player</th>
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
            {transactions.map((t: Record<string, unknown>) => {
              const deposit = t.deposit as number;
              const withdrawal = t.withdrawal as number;
              const status = t.status as string;
              const playerName = t.player_name as string | undefined;
              const playerCode = t.player_code as string | undefined;
              const allocatedPlayerId = t.allocated_player_id as number | null;
              const id = t.id as number;
              const transDate = t.trans_date as string;
              const description = t.description as string;

              return (
                <tr key={id}>
                  <td style={{ whiteSpace: "nowrap" }}>{transDate}</td>
                  <td style={{ maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis" }} title={description}>
                    {description}
                  </td>
                  <td className="text-right" style={deposit > 0 ? { color: "#2f9e44", fontWeight: 500 } : {}}>
                    {deposit > 0 ? `₦${deposit.toLocaleString()}` : ""}
                  </td>
                  <td className="text-right" style={withdrawal > 0 ? { color: "#c92a2a" } : {}}>
                    {withdrawal > 0 ? `₦${withdrawal.toLocaleString()}` : ""}
                  </td>
                  <td>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      background: status === "allocated" ? "#d1e7dd" : status === "ignored" ? "#e9ecef" : "#fff3cd",
                      color: status === "allocated" ? "#0f5132" : status === "ignored" ? "#6c757d" : "#664d03",
                    }}>
                      {status}
                    </span>
                  </td>
                  <td>
                    {playerName ? (
                      <a href={`/players/${allocatedPlayerId}`}>
                        {playerName} <span className="text-dim">({playerCode})</span>
                      </a>
                    ) : (
                      ""
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {status === "unallocated" && deposit > 0 && (
                      <a href={`/bank/${id}/allocate`} className="btn btn-sm btn-primary">
                        Allocate
                      </a>
                    )}
                    {status === "unallocated" && (
                      <form action={handleIgnore} style={{ display: "inline" }}>
                        <input type="hidden" name="txn_id" value={id} />
                        <input type="hidden" name="reason" value="Not a player payment" />
                        <button type="submit" className="btn btn-sm" style={{ marginLeft: "4px" }}>
                          Ignore
                        </button>
                      </form>
                    )}
                    {status === "allocated" && (
                      <form action={handleUnallocate} style={{ display: "inline" }}>
                        <input type="hidden" name="txn_id" value={id} />
                        <button type="submit" className="btn btn-sm" style={{ marginLeft: "4px" }}>
                          Undo
                        </button>
                      </form>
                    )}
                    {status === "ignored" && (
                      <form action={handleUnallocate} style={{ display: "inline" }}>
                        <input type="hidden" name="txn_id" value={id} />
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
