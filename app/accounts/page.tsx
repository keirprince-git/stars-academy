import { requireAuth } from "@/lib/auth";
import { getIncomeAndExpenditure, getLedgerTransactions } from "@/lib/db";
import { getCategoryLabel } from "@/lib/categories";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  if (auth.role !== "admin") {
    return <p className="error-msg">Only admins can view accounts.</p>;
  }

  const sp = await searchParams;
  const from = sp.from ?? "";
  const to = sp.to ?? "";

  const data = getIncomeAndExpenditure({
    from: from || undefined,
    to: to || undefined,
  });

  const periodLabel = from && to
    ? `${from} to ${to}`
    : from
    ? `From ${from}`
    : to
    ? `Up to ${to}`
    : "All time";

  const periodQs = [from && `from=${from}`, to && `to=${to}`].filter(Boolean).join("&");
  const activeAccount = sp.account ?? "";
  const activeIsIncome = sp.income === "1";
  const ledger = activeAccount
    ? getLedgerTransactions(activeAccount, activeIsIncome, { from: from || undefined, to: to || undefined })
    : [];
  const ledgerTotal = ledger.reduce((s, t) => s + t.amount, 0);
  const lineLink = (category: string, income: boolean) =>
    `/accounts?account=${encodeURIComponent(category)}&income=${income ? 1 : 0}${periodQs ? `&${periodQs}` : ""}`;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Income &amp; Expenditure</h2>
        <a href="/accounts/categories" className="btn btn-sm">Manage Categories</a>
      </div>

      {/* Period filter */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <form method="GET" action="/accounts">
          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <div className="form-group">
              <label htmlFor="from">From</label>
              <input id="from" name="from" type="date" defaultValue={from} />
            </div>
            <div className="form-group">
              <label htmlFor="to">To</label>
              <input id="to" name="to" type="date" defaultValue={to} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginBottom: "0.25rem" }}>Filter</button>
            <a href="/accounts" className="btn" style={{ marginBottom: "0.25rem" }}>All time</a>
          </div>
        </form>
      </div>

      {/* Summary chips */}
      <div className="summary-row">
        <div className="chip">
          <span className="chip-value" style={{ color: "var(--success)", fontSize: "1rem" }}>
            ₦{Math.round(data.totalIncome).toLocaleString()}
          </span>
          <span className="chip-label">Total Income</span>
        </div>
        <div className="chip">
          <span className="chip-value" style={{ color: "var(--danger)", fontSize: "1rem" }}>
            ₦{Math.round(data.totalExpenses).toLocaleString()}
          </span>
          <span className="chip-label">Total Expenses</span>
        </div>
        <div className="chip">
          <span className="chip-value" style={{
            color: data.surplus >= 0 ? "var(--success)" : "var(--danger)",
            fontSize: "1rem",
          }}>
            ₦{Math.round(data.surplus).toLocaleString()}
          </span>
          <span className="chip-label">Surplus / (Deficit)</span>
        </div>
      </div>

      <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>{periodLabel}</p>

      {/* Drill-down: transactions behind a clicked line */}
      {activeAccount && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", gap: "1rem" }}>
            <h2 style={{ margin: 0 }}>
              {getCategoryLabel(activeAccount)} — {activeIsIncome ? "income" : "expense"} ({ledger.length})
            </h2>
            <a href={`/accounts${periodQs ? `?${periodQs}` : ""}`} className="btn btn-sm">Close</a>
          </div>
          {ledger.length === 0 ? (
            <p className="text-dim">No transactions for this account in the period.</p>
          ) : (
            <div style={{ overflow: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Detail</th>
                    <th className="text-right">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((t, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: "nowrap" }}>{t.trans_date}</td>
                      <td style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis" }} title={t.description}>{t.description}</td>
                      <td className="text-dim">{t.detail ?? ""}</td>
                      <td className="text-right" style={{ fontWeight: 500 }}>₦{t.amount.toLocaleString()}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <a href={t.source === "split" ? `/bank/${t.txn_id}/categorise` : `/bank/${t.txn_id}/allocate`} className="btn btn-sm">View</a>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border)" }}>
                    <td colSpan={3} className="text-right">Total</td>
                    <td className="text-right">₦{Math.round(ledgerTotal).toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Income */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem", color: "var(--success)" }}>Income</h2>
        {data.income.length === 0 ? (
          <p className="text-dim">No income recorded for this period.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {data.income.map((line) => (
                <tr key={line.category}>
                  <td><a href={lineLink(line.category, true)}>{getCategoryLabel(line.category)}</a></td>
                  <td className="text-right" style={{ color: "var(--success)", fontWeight: 500 }}>
                    ₦{Math.round(line.total).toLocaleString()}
                  </td>
                  <td className="text-right text-dim">{line.count}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border)" }}>
                <td>Total Income</td>
                <td className="text-right" style={{ color: "var(--success)" }}>
                  ₦{Math.round(data.totalIncome).toLocaleString()}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Expenses */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem", color: "var(--danger)" }}>Expenses</h2>
        {data.expenses.length === 0 ? (
          <p className="text-dim">No expenses recorded for this period.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {data.expenses.map((line) => (
                <tr key={line.category}>
                  <td><a href={lineLink(line.category, false)}>{getCategoryLabel(line.category)}</a></td>
                  <td className="text-right" style={{ color: "var(--danger)", fontWeight: 500 }}>
                    ₦{Math.round(line.total).toLocaleString()}
                  </td>
                  <td className="text-right text-dim">{line.count}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border)" }}>
                <td>Total Expenses</td>
                <td className="text-right" style={{ color: "var(--danger)" }}>
                  ₦{Math.round(data.totalExpenses).toLocaleString()}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Surplus */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <table>
          <tbody>
            <tr style={{ fontWeight: 600, fontSize: "1.1rem" }}>
              <td>Net Surplus / (Deficit)</td>
              <td className="text-right" style={{ color: data.surplus >= 0 ? "var(--success)" : "var(--danger)" }}>
                {data.surplus < 0 ? `(₦${Math.round(Math.abs(data.surplus)).toLocaleString()})` : `₦${Math.round(data.surplus).toLocaleString()}`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Uncategorised warning */}
      {data.uncategorisedCount > 0 && (
        <div className="alert alert-warning">
          {data.uncategorisedCount} ignored transaction{data.uncategorisedCount !== 1 ? "s" : ""} not yet categorised
          (₦{Math.round(data.uncategorisedWithdrawals).toLocaleString()} withdrawals,
          ₦{Math.round(data.uncategorisedDeposits).toLocaleString()} deposits).{" "}
          <a href="/bank?status=ignored">Categorise them</a>
        </div>
      )}
    </>
  );
}
