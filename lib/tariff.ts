/* ── Stars Academy session pricing (from 2026) ──────── */

export interface TariffPackage {
  label: string;
  sessions: number;
  price: { Upper: number; Lower: number };
}

export const TARIFF: TariffPackage[] = [
  { label: "One session",     sessions: 1,  price: { Upper: 12000, Lower: 12000 } },
  { label: "Four sessions",   sessions: 4,  price: { Upper: 35000, Lower: 30000 } },
  { label: "Eight sessions",  sessions: 8,  price: { Upper: 50000, Lower: 45000 } },
  { label: "Twelve sessions", sessions: 12, price: { Upper: 60000, Lower: 60000 } },
];

/** Look up the best matching package for a given amount and age group */
export function matchPackage(
  amount: number,
  ageGroup: string | null,
): TariffPackage | null {
  const group = ageGroup === "Lower" ? "Lower" : "Upper";
  return TARIFF.find(t => t.price[group] === amount) ?? null;
}

/** Get the price for a package given an age group */
export function getPrice(pkg: TariffPackage, ageGroup: string | null): number {
  return ageGroup === "Lower" ? pkg.price.Lower : pkg.price.Upper;
}
