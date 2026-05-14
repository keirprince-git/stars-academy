"use client";

import { useState } from "react";
import type { TariffPackage } from "@/lib/tariff";

interface PlayerLite {
  id: number;
  code: string;
  name: string;
  source: string | null;
}

export default function AllocationForm({
  players,
  tariff,
  remaining,
  guessedIds,
  bestGuess,
  handleAllocate,
}: {
  players: PlayerLite[];
  tariff: TariffPackage[];
  remaining: number;
  guessedIds: number[];
  bestGuess: number | null;
  handleAllocate: (formData: FormData) => Promise<void>;
}) {
  const [playerId, setPlayerId] = useState<string>(bestGuess ? String(bestGuess) : "");
  const [pkg, setPkg] = useState<string>("");
  const [amount, setAmount] = useState<string>(String(remaining));
  const [sessions, setSessions] = useState<string>("");

  const selectedPlayer = players.find((p) => p.id === Number(playerId));
  const group: "Upper" | "Lower" = selectedPlayer?.source === "Lower" ? "Lower" : "Upper";

  const isPackageLocked = pkg !== "" && pkg !== "Custom";
  const matchedPkg = tariff.find((t) => t.label === pkg);

  function handlePlayerChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setPlayerId(e.target.value);
    // Reset package + amounts whenever the player (and therefore the rate group) changes.
    setPkg("");
    setAmount(String(remaining));
    setSessions("");
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

  return (
    <form action={handleAllocate}>
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
        {playerId && (
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
        <a href="/bank" className="btn">
          Done
        </a>
      </div>
    </form>
  );
}
