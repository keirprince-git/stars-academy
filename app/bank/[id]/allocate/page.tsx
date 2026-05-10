import { requireAuth } from "@/lib/auth";
import { getBankTransaction, getBankAllocations, getPlayers, addBankAllocation, removeBankAllocation } from "@/lib/db";
import { TARIFF } from "@/lib/tariff";
import { redirect } from "next/navigation";

export default async function AllocatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  if (auth.role !== "admin") {
    return <p className="error-msg">Only admins can allocate transactions.</p>;
  }

  const { id } = await params;
  const sp = await searchParams;
  const txnId = parseInt(id, 10);
  const txn = getBankTransaction(txnId);

  if (!txn) {
    return <p className="error-msg">Transaction not found.</p>;
  }

  const allocations = getBankAllocations(txnId);
  const players = getPlayers({ status: "Active", sort: "name", dir: "asc" });
  const remaining = Math.round((txn.deposit - txn.allocated_amount) * 100) / 100;

  // Build player age-group lookup for client-side script
  const playerGroups: Record<number, string> = {};
  for (const p of players) {
    playerGroups[p.id] = p.source === "Lower" ? "Lower" : "Upper";
  }

  /* ── Server actions ──────────────────────────────────── */

  const handleAllocate = async (formData: FormData) => {
    "use server";
    const playerId = parseInt(formData.get("player_id") as string, 10);
    const sessions = parseInt(formData.get("sessions_purchased") as string, 10);
    const amount = parseFloat(formData.get("amount") as string);
    const packageName = (formData.get("package") as string) || null;
    const notes = (formData.get("notes") as string) || null;

    if (!playerId || isNaN(sessions) || sessions <= 0 || isNaN(amount) || amount <= 0) {
      redirect(`/bank/${txnId}/allocate?error=invalid`);
    }

    try {
      addBankAllocation(txnId, playerId, amount, sessions, packageName, notes);
      redirect(`/bank/${txnId}/allocate?success=added`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      redirect(`/bank/${txnId}/allocate?error=${encodeURIComponent(msg)}`);
    }
  };

  const handleRemove = async (formData: FormData) => {
    "use server";
    const allocId = parseInt(formData.get("alloc_id") as string, 10);
    try {
      removeBankAllocation(allocId);
      redirect(`/bank/${txnId}/allocate?success=removed`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      redirect(`/bank/${txnId}/allocate?error=${encodeURIComponent(msg)}`);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Allocate Payment</h2>
        <a href="/bank" className="btn btn-sm">Back to Bank</a>
      </div>

      {sp.success === "added" && (
        <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          Allocation added.
        </div>
      )}
      {sp.success === "removed" && (
        <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          Allocation removed.
        </div>
      )}
      {sp.error === "invalid" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Please fill in all required fields.</div>
      )}
      {sp.error && sp.error !== "invalid" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>{sp.error}</div>
      )}

      {/* ── Transaction summary ──────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Transaction Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.4rem 1rem", fontSize: "0.9rem" }}>
          <span className="text-dim">Date:</span>
          <span>{txn.trans_date}</span>
          <span className="text-dim">Total amount:</span>
          <span style={{ color: "#2f9e44", fontWeight: 600, fontSize: "1.1rem" }}>
            ₦{txn.deposit.toLocaleString()}
          </span>
          <span className="text-dim">Allocated so far:</span>
          <span>₦{txn.allocated_amount.toLocaleString()}</span>
          <span className="text-dim">Remaining:</span>
          <span style={remaining > 0 ? { color: "#e67700", fontWeight: 600 } : {}}>
            ₦{remaining.toLocaleString()}
          </span>
          <span className="text-dim">Description:</span>
          <span>{txn.description}</span>
          <span className="text-dim">Reference:</span>
          <span>{txn.reference || "—"}</span>
          <span className="text-dim">Status:</span>
          <span>{txn.status}</span>
        </div>
      </div>

      {/* ── Existing allocations ─────────────────────── */}
      {allocations.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginBottom: "0.75rem" }}>Current Allocations ({allocations.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Sessions</th>
                <th>Package</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id}>
                  <td>
                    <a href={`/players/${a.player_id}`}>{a.player_name}</a>
                    <span className="text-dim"> ({a.player_code})</span>
                  </td>
                  <td className="text-right">₦{a.amount.toLocaleString()}</td>
                  <td className="text-right">{a.sessions_purchased}</td>
                  <td>{a.package || "—"}</td>
                  <td className="text-dim">{a.notes || ""}</td>
                  <td>
                    <form action={handleRemove} style={{ display: "inline" }}>
                      <input type="hidden" name="alloc_id" value={a.id} />
                      <button type="submit" className="btn btn-sm">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add allocation form ──────────────────────── */}
      {remaining > 0 && txn.status !== "ignored" && (
        <div className="card">
          <h2 style={{ marginBottom: "0.75rem" }}>
            {allocations.length > 0 ? "Add Another Player" : "Assign to Player"}
          </h2>
          <form action={handleAllocate} id="allocForm">
            <div className="form-group">
              <label htmlFor="player_id">Player</label>
              <select id="player_id" name="player_id" required style={{ maxWidth: "400px" }}>
                <option value="">— Select a player —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name} ({p.source ?? "—"})
                  </option>
                ))}
              </select>
              <span id="playerGroup" className="text-dim" style={{ marginLeft: "0.5rem", fontSize: "0.85rem" }}></span>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="package">Package</label>
                <select id="package" name="package" style={{ maxWidth: "280px" }}>
                  <option value="">— Select package —</option>
                  <option value="Custom">Custom amount</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="amount">Amount (₦)</label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="1"
                  max={remaining}
                  defaultValue={remaining}
                  required
                  style={{ maxWidth: "150px" }}
                />
              </div>
              <div className="form-group">
                <label htmlFor="sessions_purchased">Sessions</label>
                <input
                  id="sessions_purchased"
                  name="sessions_purchased"
                  type="number"
                  min="1"
                  required
                  placeholder="e.g. 8"
                  style={{ maxWidth: "120px" }}
                />
              </div>
            </div>

            <div id="tariffHint" style={{ fontSize: "0.8rem", color: "#6c757d", marginBottom: "0.5rem", display: "none" }}></div>

            <div className="form-group">
              <label htmlFor="notes">Notes (optional)</label>
              <input
                id="notes"
                name="notes"
                type="text"
                placeholder="e.g. Payment for Term 2"
                style={{ maxWidth: "400px" }}
              />
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="submit" className="btn btn-primary">
                Add Allocation
              </button>
              <a href="/bank" className="btn">Done</a>
            </div>
          </form>
        </div>
      )}

      {remaining <= 0 && txn.status !== "ignored" && (
        <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "1rem", marginTop: "0.5rem", textAlign: "center" }}>
          This transaction is fully allocated.
          <div style={{ marginTop: "0.5rem" }}>
            <a href="/bank" className="btn btn-sm">Back to Bank</a>
          </div>
        </div>
      )}

      {/* ── Client-side tariff logic ────────────────────── */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          var tariff = ${JSON.stringify(TARIFF)};
          var groups = ${JSON.stringify(playerGroups)};
          var remaining = ${remaining};

          var playerSel = document.getElementById('player_id');
          var pkgSel = document.getElementById('package');
          var amountEl = document.getElementById('amount');
          var sessionsEl = document.getElementById('sessions_purchased');
          var groupLabel = document.getElementById('playerGroup');
          var hintEl = document.getElementById('tariffHint');

          function getGroup() {
            var pid = parseInt(playerSel.value);
            return groups[pid] || 'Upper';
          }

          function rebuildPackages() {
            var g = getGroup();
            // Keep first two options (select + custom)
            while (pkgSel.options.length > 2) pkgSel.remove(2);
            tariff.forEach(function(t) {
              var price = t.price[g];
              var opt = document.createElement('option');
              opt.value = t.label;
              opt.textContent = t.label + ' — ₦' + price.toLocaleString();
              if (price > remaining) {
                opt.disabled = true;
                opt.textContent += ' (exceeds remaining)';
              }
              pkgSel.appendChild(opt);
            });
            // Show age group label
            if (playerSel.value) {
              groupLabel.textContent = g + ' group';
            } else {
              groupLabel.textContent = '';
            }
          }

          function onPackageChange() {
            var g = getGroup();
            var selected = pkgSel.value;
            if (!selected || selected === 'Custom') {
              amountEl.readOnly = false;
              sessionsEl.readOnly = false;
              hintEl.style.display = 'none';
              return;
            }
            var match = tariff.find(function(t) { return t.label === selected; });
            if (match) {
              var price = match.price[g];
              amountEl.value = price;
              sessionsEl.value = match.sessions;
              amountEl.readOnly = true;
              sessionsEl.readOnly = true;
              hintEl.textContent = '₦' + Math.round(price / match.sessions).toLocaleString() + ' per session (' + g + ' rate)';
              hintEl.style.display = 'block';
            }
          }

          playerSel.addEventListener('change', function() {
            rebuildPackages();
            // Reset package selection
            pkgSel.value = '';
            amountEl.value = remaining;
            amountEl.readOnly = false;
            sessionsEl.value = '';
            sessionsEl.readOnly = false;
            hintEl.style.display = 'none';
          });

          pkgSel.addEventListener('change', onPackageChange);

          // Init
          rebuildPackages();
        })();
      `}} />
    </>
  );
}
