import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Auto-categorise ignored bank transactions based on description patterns.
 * GET /api/categorise?key=stars2026seed
 *
 * Only updates transactions that have no category set yet.
 * Add &force=1 to re-categorise all ignored transactions.
 */

interface Rule {
  pattern: RegExp;
  category: string;
  withdrawalOnly?: boolean;
}

const RULES: Rule[] = [
  // Bank charges
  { pattern: /sms\s*charges/i,           category: "bank_charges" },
  { pattern: /smscharges/i,              category: "bank_charges" },

  // Stamp duty
  { pattern: /stamp\s*duty/i,            category: "stamp_duty" },
  { pattern: /stampduty/i,               category: "stamp_duty" },

  // Drawings (transfers to Sunny / owner) — withdrawals only
  { pattern: /IFO\s*SUNDAY\s*O/i,        category: "drawings", withdrawalOnly: true },
  { pattern: /IFOSUNDAYOSILAMA/i,        category: "drawings", withdrawalOnly: true },
  { pattern: /TRFIFOSUNDAY/i,            category: "drawings", withdrawalOnly: true },
  { pattern: /TRF\s*IFO\s*SUND/i,        category: "drawings", withdrawalOnly: true },
  { pattern: /IFO\s*Sunday\s*Osilama/i,  category: "drawings", withdrawalOnly: true },

  // Kit sales — withdrawals to Sunny for kit purchases
  { pattern: /SEARCHTHE\s*S/i,           category: "setup_costs", withdrawalOnly: true },

  // Insurance
  { pattern: /insurance/i,               category: "insurance" },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (key !== "stars2026seed") {
    return NextResponse.json({ error: "Invalid key" }, { status: 403 });
  }

  const force = searchParams.get("force") === "1";
  const d = db();

  // Get ignored transactions without a category (or all ignored if force)
  const condition = force
    ? "status = 'ignored'"
    : "status = 'ignored' AND category IS NULL";

  const rows = d
    .prepare(`SELECT id, description, withdrawal FROM bank_transactions WHERE ${condition}`)
    .all() as Array<{ id: number; description: string; withdrawal: number }>;

  const update = d.prepare(
    "UPDATE bank_transactions SET category = ? WHERE id = ?"
  );

  let matched = 0;
  const results: Array<{ id: number; desc: string; category: string }> = [];

  const tx = d.transaction(() => {
    for (const row of rows) {
      for (const rule of RULES) {
        if (rule.withdrawalOnly && row.withdrawal <= 0) continue;
        if (rule.pattern.test(row.description)) {
          update.run(rule.category, row.id);
          matched++;
          results.push({
            id: row.id,
            desc: row.description.slice(0, 60),
            category: rule.category,
          });
          break; // first match wins
        }
      }
    }
  });

  tx();

  return NextResponse.json({
    scanned: rows.length,
    categorised: matched,
    uncategorised: rows.length - matched,
    results,
  });
}
