"use client";

import { useEffect, useState } from "react";

/**
 * Live running total for the bundle builder. Reads the amount inputs (marked
 * data-bundle-amount) and shows how the entered lines compare to the pool, so
 * a mismatch is obvious before the user hits Save. Server still validates on
 * submit; this is purely a guide.
 */
export default function BundleTotals({ pool }: { pool: number }) {
  const [sum, setSum] = useState(0);

  useEffect(() => {
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>("[data-bundle-amount]")
    );
    const recalc = () => {
      let s = 0;
      for (const el of inputs) {
        const v = parseFloat(el.value);
        if (!isNaN(v)) s += v;
      }
      setSum(Math.round(s * 100) / 100);
    };
    inputs.forEach((el) => el.addEventListener("input", recalc));
    recalc();
    return () => inputs.forEach((el) => el.removeEventListener("input", recalc));
  }, []);

  const diff = Math.round((pool - sum) * 100) / 100;
  const ok = Math.abs(diff) < 0.01;
  const color = ok ? "var(--success)" : diff > 0 ? "var(--warning)" : "var(--danger)";

  return (
    <div style={{ marginBottom: "0.75rem", fontWeight: 600 }}>
      Lines total: ₦{sum.toLocaleString()} &nbsp;·&nbsp; Pool total: ₦{pool.toLocaleString()}{" "}
      <span style={{ color, marginLeft: "0.5rem" }}>
        {ok
          ? "✓ matches the pool"
          : diff > 0
          ? `— ₦${Math.abs(diff).toLocaleString()} still to allocate`
          : `— ₦${Math.abs(diff).toLocaleString()} over the pool`}
      </span>
    </div>
  );
}
