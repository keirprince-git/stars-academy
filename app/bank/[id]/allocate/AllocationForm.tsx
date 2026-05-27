"use client";

import { useState } from "react";
import type { TariffPackage } from "@/lib/tariff";

interface PlayerLite {
  id: number;
  code: string;
  name: string;
  source: string | null;
}

type PaymentKind = "session" | "kit";

interface KitOrderLite {
  orderId: number;
  status: string;
}

export default function AllocationForm({
  players,
  tariff,
  remaining,
  guessedIds,
  bestGuess,
  kitPrice,
  kitOrdersByPlayer,
  handleAllocate,
}: {
  players: PlayerLite[];
  tariff: TariffPackage[];
  remaining: number;
  guessedIds: number[];
  bestGuess: number | null;
  kitPrice: number;
  kitOrdersByPlayer: Record<number, KitOrderLite>;
  handleAllocate: (formData: FormData) => Promise<void>;
}) {
  const [kind, setKind] = useState<PaymentKind>("session");
  const [playerId, setPlayerId] = useState<string>(bestGuess ? String(bestGuess) : "");
  const [pkg, setPkg] = useState<string>("");
  const [amount, setAmount] = useState<string>(String(remaining));
  const [sessions, setSessions] = useState<string>("");

  const selectedPlayer = players.find((p) => p.id === Number(playerId));
  const group: "Upper" | "Lower" = selectedPlayer?.source === "Lower" ? "Lower" : "Upper";

  const isPackageLocked = kind === "session" && pkg !== "" && pkg !== "Custom";
  const matchedPkg = tariff.find((t) => t.label === pkg);

  const selectedKitOrder = playerId ? kitOrdersByPlayer[Number(playerId)] : undefined;
  const kitDefaultAmount = Math.min(kitPrice, remaining);

  function handleKindChange(newKind: PaymentKind) {
    setKind(newKind);
    // Reset money fields to sensible defaults for the chosen kind.
    if (newKind === "kit") {
      setAmount(String(kitDefaultAmount));
      setPkg("");
      setSessions("");
    } else {
      setAmount(String(remaining));
      setPkg("");
      setSessions("");
    }
  }

  function handlePlayerChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value;
    setPlayerId(newId);
    if (kind === "kit") {
      // Recompute kit default — same value but reset any local edits.
      setAmount(String(kitDefaultAmount));
    } else {
      setPkg("");
      setAmount(String(remaining));
      setSessions("");
    }
  }

  function handlePackageChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    setPkg(v);
    if (v && v !== "Custom") {
      const m = tariff.find((t) => t.label === v);
      if (m) {
        setAmount(String(m.price[group]));
        setSessions(String(m.sessions));
      }
    } else {
      setAmount(String(remaining));
      setSessions("");
    }
  }

  const perSessionHint =
    isPackageLocked && matchedPkg
      ? `₦${Math.round(matchedPkg.price[group] / matchedPkg.sessions).toLocaleString()} per session (${group} rate)`
      : null;

  const kitStatusLabel: Record<string, string> = {
    pending: "Pending — parent hasn’t confirmed yet",
    confirmed: "Confirmed — ready to record payment",
    paid: "Already paid",
    gifted: "Marked as free (no payment expected)",
    collected: "Already paid and collected",
    declined: "Parent declined this kit",
  };

  return (
    <form action={handleAllocate}>
      {/* ── Payment type selector ────────────────────── */}
      <div className="form-group">
        <label>What is this payment for?</label>
        <div role="radiogroup" style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
          <label className="kind-pill" style={kindPillStyle(kind === "session")}>
            <input
              type="radio"
              name="kind"
              value="session"
              checked={kind === "session"}
              onChange={() => handleKindChange("session")}
              style={{ marginRight: "0.4rem" }}
            />
            Sessions
          </label>
          <label className="kind-pill" style={kindPillStyle(kind === "kit")}>
            <input
              type="radio"
              name="kind"
              value="kit"
              checked={kind === "kit"}
              onChange={() => handleKindChange("kit")}
              style={{ marginRight: "0.4rem" }}
            />
            Kit
          </label>
        </div>
      </div>

      {/* ── Player ──────────────────────────────────── */}
      <div className="form-group">
        <label htmlFor="player_id">Player</label>
        <select
          id="player_id"
          name="player_id"
          required
          style={{ maxWidth: "400px" }}
          value={playerId}
          onChange={handlePlayerChange}
        >
          <option value="">— Select a player —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {guessedIds.includes(p.id) ? "★ " : ""}
              {p.code} — {p.name} ({p.source ?? "—"})
            </option>
          ))}
        </select>
        {playerId && kind === "session" && (
          <span className="text-dim" style={{ marginLeft: "0.5rem", fontSize: "0.85rem" }}>
            {group} group
          </span>
        )}
        {guessedIds.length > 0 && (
          <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.25rem" }}>
            ★ Suggested based on transaction description
          </div>
        )}
      </div>

      {/* ── Kit-specific block ──────────────────────── */}
      {kind === "kit" && (
        <>
          {playerId && selectedKitOrder && (
            <div className="alert" style={kitStatusStyle(selectedKitOrder.status)}>
              <strong>{selectedPlayer?.name}’s kit:</strong>{" "}
              {kitStatusLabel[selectedKitOrder.status] ?? selectedKitOrder.status}
            </div>
          )}
          {playerId && selectedKitOrder && (
            <input type="hidden" name="kit_order_id" value={selectedKitOrder.orderId} />
          )}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="amount-kit">Amount (₦)</label>
              <input
                id="amount-kit"
                name="amount"
                type="number"
                step="0.01"
                min="1"
                max={remaining}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                style={{ maxWidth: "180px" }}
              />
              <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.25rem" }}>
                Kit price: ₦{kitPrice.toLocaleString()} · Remaining on this txn: ₦{remaining.toLocaleString()}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Sessions-specific block ─────────────────── */}
      {kind === "session" && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="package">Package</label>
              <select
                id="package"
                name="package"
                style={{ maxWidth: "280px" }}
                value={pkg}
                onChange={handlePackageChange}
              >
                <option value="">— Select package —</option>
                <option value="Custom">Custom amount</option>
                {tariff.map((t) => {
                  const price = t.price[group];
                  const tooBig = price > remaining;
                  return (
                    <option key={t.label} value={t.label} disabled={tooBig}>
                      {t.label} — ₦{price.toLocaleString()}
                      {tooBig ? " (exceeds remaining)" : ""}
                    </option>
                  );
                })}
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
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                readOnly={isPackageLocked}
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
                value={sessions}
                onChange={(e) => setSessions(e.target.value)}
                readOnly={isPackageLocked}
                required
                placeholder="e.g. 8"
                style={{ maxWidth: "120px" }}
              />
            </div>
          </div>

          {perSessionHint && (
            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
              {perSessionHint}
            </div>
          )}
        </>
      )}

      {/* ── Notes (both kinds) ──────────────────────── */}
      <div className="form-group">
        <label htmlFor="notes">Notes (optional)</label>
        <input
          id="notes"
          name="notes"
          type="text"
          placeholder={kind === "kit" ? "e.g. kit payment for May 2026" : "e.g. Payment for Term 2"}
          style={{ maxWidth: "400px" }}
        />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <button type="submit" className="btn btn-primary">
          {kind === "kit" ? "Record Kit Payment" : "Add Allocation"}
        </button>
        <a href="/bank" className="btn">Done</a>
      </div>
    </form>
  );
}

function kindPillStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.45rem 0.9rem",
    border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
    background: active ? "var(--primary-soft)" : "var(--surface)",
    color: active ? "var(--primary-hover)" : "var(--text)",
    borderRadius: "var(--radius)",
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    fontSize: "0.9rem",
  };
}

function kitStatusStyle(status: string): React.CSSProperties {
  // confirmed/pending → info; paid/gifted/collected → success/warning
  if (status === "pending") {
    return { background: "#fdefd0", color: "#8a5a10", border: "1px solid #f5dfa5" };
  }
  if (status === "confirmed") {
    return { background: "#fff4ea", color: "#8a4a10", border: "1px solid #fbe1c4" };
  }
  if (status === "paid" || status === "collected") {
    return { background: "#e0f3e8", color: "#1d6e3f", border: "1px solid #c5e6d2" };
  }
  if (status === "gifted") {
    return { background: "#ece2f7", color: "#5a3296", border: "1px solid #d8c9ee" };
  }
  if (status === "declined") {
    return { background: "#fde7e7", color: "#b22020", border: "1px solid #f5cdcd" };
  }
  return { background: "#ebedf0", color: "#6a727a", border: "1px solid #d6dade" };
}
