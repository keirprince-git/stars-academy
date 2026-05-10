import { requireAuth } from "@/lib/auth";
import { getIncomeAndExpenditure } from "@/lib/db";
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

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Income &amp; Expenditure</h2>
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
          <span className="chip-value" style={{ color: "#2f9e44", fontSize: "1rem" }}>
            ₦{Math.round(data.totalIncome).toLocaleString()}
          </span>
          <span className="chip-label">Total Income</span>
        </div>
        <div className="chip">
          <span className="chip-value" style={{ color: "#c92a2a", fontSize: "1rem" }}>
            ₦{Math.round(data.totalExpenses).toLocaleString()}
          </span>
          <span className="chip-label">Total Expenses</span>
        </div>
        <div className="chip">
          <span className="chip-value" style={{
            color: data.surplus >= 0 ? "#2f9e44" : "#c92a2a",
            fontSize: "1rem",
          }}>
            ₦{Math.round(data.surplus).toLocaleString()}
          </span>
          <span className="chip-label">Surplus / (Deficit)</span>
        </div>
      </div>

      <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>{periodLabel}</p>

      {/* Income */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem", color: "#2f9e44" }}>Income</h2>
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
                  <td>{getCategoryLabel(line.category)}</td>
                  <td className="text-right" style={{ color: "#2f9e44", fontWeight: 500 }}>
                    ₦{Math.round(line.total).toLocaleString()}
                  </td>
                  <td className="text-right text-dim">{line.count}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border)" }}>
                <td>Total Income</td>
                <td className="text-right" style={{ color: "#2f9e44" }}>
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
        <h2 style={{ marginBottom: "0.75rem", color: "#c92a2a" }}>Expenses</h2>
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
                  <td>{getCategoryLabel(line.category)}</td>
                  <td className="text-right" style={{ color: "#c92a2a", fontWeight: 500 }}>
                    ₦{Math.round(line.total).toLocaleString()}
                  </td>
                  <td className="text-right text-dim">{line.count}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border)" }}>
                <td>Total Expenses</td>
                <td className="text-right" style={{ color: "#c92a2a" }}>
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
              <td className="text-right" style={{ color: data.surplus >= 0 ? "#2f9e44" : "#c92a2a" }}>
                {data.surplus < 0 ? `(₦${Math.round(Math.abs(data.surplus)).toLocaleString()})` : `₦${Math.round(data.surplus).toLocaleString()}`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Uncategorised warning */}
      {data.uncategorisedCount > 0 && (
        <div style={{
          background: "#fff3cd",
          border: "1px solid #ffecb5",
          borderRadius: "6px",
          padding: "0.75rem 1rem",
          fontSize: "0.9rem",
        }}>
          {data.uncategorisedCount} ignored transaction{data.uncategorisedCount !== 1 ? "s" : ""} not yet categorised
          (₦{Math.round(data.uncategorisedWithdrawals).toLocaleString()} withdrawals,
          ₦{Math.round(data.uncategorisedDeposits).toLocaleString()} deposits).{" "}
          <a href="/bank?status=ignored">Categorise them</a>
        </div>
      )}
    </>
  );
}
