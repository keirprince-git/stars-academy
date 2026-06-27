import { requireAuth } from "@/lib/auth";
import { getBankTransaction, getPlayers, createBundle } from "@/lib/db";
import { getAllCategories } from "@/lib/categories";
import { redirect } from "next/navigation";

export default async function BundlePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireAuth();
  if (auth.role !== "admin") {
    return <p className="error-msg">Only admins can bundle payments.</p>;
  }

  const sp = await searchParams;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const rawIds = sp.ids;
  const idList = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n));

  const deposits = idList
    .map((id) => getBankTransaction(id))
    .filter((t): t is NonNullable<typeof t> => !!t && t.deposit > 0 && t.status !== "ignored")
    .map((t) => ({
      id: t.id,
      trans_date: t.trans_date,
      description: t.description,
      remaining: round2(t.deposit - t.allocated_amount),
    }))
    .filter((t) => t.remaining > 0)
    .sort((a, b) => (a.trans_date < b.trans_date ? -1 : a.trans_date > b.trans_date ? 1 : a.id - b.id));

  const pool = round2(deposits.reduce((s, t) => s + t.remaining, 0));
  const eligibleIds = deposits.map((t) => t.id);

  const players = getPlayers({ status: "Active", sort: "name", dir: "asc" });
  const incomeCategories = getAllCategories().filter((c) => c.type === "income");
  const errorMsg = typeof sp.error === "string" ? sp.error : null;

  const handleSave = async (formData: FormData) => {
    "use server";
    const playerLines: Array<{ playerId: number; sessions: number; amount: number; package: string | null; notes: string | null }> = [];
    let i = 0;
    while (formData.has(`p_player_${i}`)) {
      const playerId = parseInt(formData.get(`p_player_${i}`) as string, 10);
      const sessions = parseInt(formData.get(`p_sessions_${i}`) as string, 10);
      const amount = parseFloat(formData.get(`p_amount_${i}`) as string);
      const pkg = ((formData.get(`p_pkg_${i}`) as string) || "").trim() || null;
      if (playerId && !isNaN(sessions) && sessions > 0 && !isNaN(amount) && amount > 0) {
        playerLines.push({ playerId, sessions, amount, package: pkg, notes: null });
      }
      i++;
    }
    const categoryLines: Array<{ category: string; amount: number; notes: string | null }> = [];
    let j = 0;
    while (formData.has(`c_cat_${j}`)) {
      const category = ((formData.get(`c_cat_${j}`) as string) || "").trim();
      const amount = parseFloat(formData.get(`c_amount_${j}`) as string);
      const notes = ((formData.get(`c_notes_${j}`) as string) || "").trim() || null;
      if (category && !isNaN(amount) && amount > 0) {
        categoryLines.push({ category, amount, notes });
      }
      j++;
    }

    const qs = eligibleIds.map((id) => `ids=${id}`).join("&");
    try {
      createBundle(eligibleIds, playerLines, categoryLines);
      redirect("/bank?success=bundled");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      redirect(`/bank/bundle?${qs}&error=${encodeURIComponent(msg)}`);
    }
  };

  if (eligibleIds.length === 0) {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2>Bundle &amp; Allocate</h2>
          <a href="/bank" className="btn btn-sm">Back to Bank</a>
        </div>
        <div className="error-msg">
          No eligible deposits selected. Go back and tick deposits that still have an amount left to allocate.
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Bundle &amp; Allocate</h2>
        <a href="/bank" className="btn btn-sm">Back to Bank</a>
      </div>

      {errorMsg && <div className="error-msg" style={{ marginBottom: "0.75rem" }}>{errorMsg}</div>}

      {/* Pooled deposits */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.5rem" }}>Bundled Deposits ({deposits.length})</h2>
        <table>
          <thead>
            <tr><th>Date</th><th>Description</th><th className="text-right">Amount</th></tr>
          </thead>
          <tbody>
            {deposits.map((t) => (
              <tr key={t.id}>
                <td style={{ whiteSpace: "nowrap" }}>{t.trans_date}</td>
                <td style={{ maxWidth: "320px", overflow: "hidden", textOverflow: "ellipsis" }} title={t.description}>{t.description}</td>
                <td className="text-right" style={{ color: "var(--success)", fontWeight: 500 }}>₦{t.remaining.toLocaleString()}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
              <td></td>
              <td className="text-right">Pool total</td>
              <td className="text-right">₦{pool.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Allocation builder */}
      <div className="card">
        <h2 style={{ marginBottom: "0.25rem" }}>Allocate the ₦{pool.toLocaleString()}</h2>
        <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          Split the pooled total across player sessions and/or income categories. The line amounts must sum to the pool total.
        </p>

        <form action={handleSave}>
          <h3 style={{ fontSize: "0.95rem", margin: "0.5rem 0" }}>Player sessions</h3>
          <table style={{ marginBottom: "1rem" }}>
            <thead>
              <tr>
                <th style={{ width: "34%" }}>Player</th>
                <th className="text-right" style={{ width: "14%" }}>Sessions</th>
                <th className="text-right" style={{ width: "20%" }}>Amount (₦)</th>
                <th>Package (optional)</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td>
                    <select name={`p_player_${i}`} defaultValue="" style={{ width: "100%" }}>
                      <option value="">— Select player —</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="text-right">
                    <input name={`p_sessions_${i}`} type="number" min="0" step="1" style={{ width: "100%", textAlign: "right" }} />
                  </td>
                  <td className="text-right">
                    <input name={`p_amount_${i}`} type="number" min="0" step="0.01" data-bundle-amount style={{ width: "100%", textAlign: "right" }} />
                  </td>
                  <td>
                    <input name={`p_pkg_${i}`} type="text" placeholder="e.g. 8 sessions" style={{ width: "100%" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ fontSize: "0.95rem", margin: "0.5rem 0" }}>Income categories</h3>
          <table style={{ marginBottom: "1rem" }}>
            <thead>
              <tr>
                <th style={{ width: "34%" }}>Category</th>
                <th className="text-right" style={{ width: "20%" }}>Amount (₦)</th>
                <th>Notes (optional)</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 2 }).map((_, j) => (
                <tr key={j}>
                  <td>
                    <select name={`c_cat_${j}`} defaultValue="" style={{ width: "100%" }}>
                      <option value="">— Select category —</option>
                      {incomeCategories.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="text-right">
                    <input name={`c_amount_${j}`} type="number" min="0" step="0.01" data-bundle-amount style={{ width: "100%", textAlign: "right" }} />
                  </td>
                  <td>
                    <input name={`c_notes_${j}`} type="text" placeholder="e.g. overpayment" style={{ width: "100%" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {incomeCategories.length === 0 && (
            <div className="alert alert-info" style={{ marginBottom: "0.75rem" }}>
              No income categories exist yet. Add one (e.g. &quot;Overpayments (suspense)&quot;) in{" "}
              <a href="/accounts/categories">Accounts → Categories</a> to route the extra amount.
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginBottom: "0.75rem", fontWeight: 600, flexWrap: "wrap" }}>
            <span>Lines total: ₦<span id="bundleSum">0</span></span>
            <span>Pool total: ₦{pool.toLocaleString()}</span>
            <span id="bundleDiff" className="text-dim"></span>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="submit" className="btn btn-primary">Save bundle</button>
            <a href="/bank" className="btn">Cancel</a>
          </div>
        </form>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          var total = ${pool};
          var inputs = document.querySelectorAll('[data-bundle-amount]');
          var sumEl = document.getElementById('bundleSum');
          var diffEl = document.getElementById('bundleDiff');
          function fmt(n){ return n.toLocaleString('en-US',{maximumFractionDigits:2}); }
          function recalc(){
            var sum = 0;
            inputs.forEach(function(el){ var v = parseFloat(el.value); if(!isNaN(v)) sum += v; });
            sum = Math.round(sum*100)/100;
            sumEl.textContent = fmt(sum);
            var diff = Math.round((total - sum)*100)/100;
            if (Math.abs(diff) < 0.01) { diffEl.textContent = '✓ matches pool'; diffEl.style.color = 'var(--success)'; }
            else if (diff > 0) { diffEl.textContent = '₦' + fmt(diff) + ' still to allocate'; diffEl.style.color = 'var(--warning)'; }
            else { diffEl.textContent = '₦' + fmt(-diff) + ' over'; diffEl.style.color = 'var(--danger)'; }
          }
          inputs.forEach(function(el){ el.addEventListener('input', recalc); });
          recalc();
        })();
      `}} />
    </>
  );
}
