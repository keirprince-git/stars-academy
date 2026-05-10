/* ── Stars Academy session pricing (DB-backed) ──────── */

import { getCurrentTariffDate, getTariffPackages, type TariffRow } from "./db";

export interface TariffPackage {
  label: string;
  sessions: number;
  price: { Upper: number; Lower: number };
}

/**
 * Get the current tariff packages (most recent effective_from <= today).
 * Returns the same TariffPackage[] shape the allocate page expects.
 */
export function getCurrentTariff(): TariffPackage[] {
  const date = getCurrentTariffDate();
  if (!date) return [];
  const rows = getTariffPackages(date);
  return rows.map(rowToPackage);
}

/** For backward compat — the allocate page imports this */
export const TARIFF: TariffPackage[] = [];

// Lazy-load: TARIFF is populated on first access via a Proxy-like pattern
// But since the allocate page reads it at render time, we use a getter instead.
// The allocate page will be updated to call getCurrentTariff() directly.

/** Convert a DB row to the TariffPackage shape */
function rowToPackage(row: TariffRow): TariffPackage {
  return {
    label: row.label,
    sessions: row.sessions,
    price: { Upper: row.price_upper, Lower: row.price_lower },
  };
}

/** Look up the best matching package for a given amount and age group */
export function matchPackage(
  amount: number,
  ageGroup: string | null,
): TariffPackage | null {
  const group = ageGroup === "Lower" ? "Lower" : "Upper";
  const tariff = getCurrentTariff();
  return tariff.find(t => t.price[group] === amount) ?? null;
}

/** Get the price for a package given an age group */
export function getPrice(pkg: TariffPackage, ageGroup: string | null): number {
  return ageGroup === "Lower" ? pkg.price.Lower : pkg.price.Upper;
}
