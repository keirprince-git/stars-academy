/* ── Stars Academy session pricing (DB-backed) ──────── */

import { getCurrentTariffDate, getTariffPackages, getTariffDates, type TariffRow } from "./db";

export interface TariffPackage {
  label: string;
  sessions: number;
  price: { Upper: number; Lower: number };
}

export interface EffectiveTariff {
  packages: TariffPackage[];
  date: string | null;     // the effective_from date the packages came from
  isCurrent: boolean;      // true if that set is current-dated (effective_from <= today)
}

/**
 * Resolve the tariff to use, with graceful fallback:
 *  1. The current-dated set (most recent effective_from <= today) — normal case.
 *  2. If none is current-dated but future-dated sets exist, fall back to the
 *     earliest of those (the next set due to take effect) so the allocate page
 *     still has packages to offer. isCurrent is false in this case.
 *  3. If there are no tariff sets at all, packages is empty.
 */
export function getEffectiveTariff(): EffectiveTariff {
  const currentDate = getCurrentTariffDate();
  if (currentDate) {
    return {
      packages: getTariffPackages(currentDate).map(rowToPackage),
      date: currentDate,
      isCurrent: true,
    };
  }
  // No current-dated set — fall back to the earliest set that exists.
  const allDates = getTariffDates(); // sorted most-recent first
  if (allDates.length > 0) {
    const fallbackDate = allDates[allDates.length - 1];
    return {
      packages: getTariffPackages(fallbackDate).map(rowToPackage),
      date: fallbackDate,
      isCurrent: false,
    };
  }
  return { packages: [], date: null, isCurrent: false };
}

/**
 * Get the current tariff packages. Delegates to getEffectiveTariff() so it
 * benefits from the same fallback behaviour.
 */
export function getCurrentTariff(): TariffPackage[] {
  return getEffectiveTariff().packages;
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
