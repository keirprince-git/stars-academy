import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { BANK_TRANSACTIONS } from "@/lib/bank-seed-data";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key !== "stars2026seed") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const d = db();

  // Check if bank transactions already exist
  const count = d.prepare("SELECT COUNT(*) as c FROM bank_transactions").get() as { c: number };
  if (count.c > 0) {
    return NextResponse.json({
      message: `Bank transactions already seeded (${count.c} rows). Clear them first to re-seed.`,
      seeded: false,
    });
  }

  // Build a map of player code → player id
  const players = d.prepare("SELECT id, code FROM players").all() as { id: number; code: string }[];
  const codeToId: Record<string, number> = {};
  for (const p of players) {
    codeToId[p.code] = p.id;
  }

  const insertTxn = d.prepare(
    `INSERT INTO bank_transactions
       (trans_date, value_date, description, reference, deposit, withdrawal, balance,
        status, allocated_player_id, import_batch, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const batch = "seed-from-spreadsheet";
  let allocated = 0;
  let ignored = 0;
  let unallocated = 0;

  const tx = d.transaction(() => {
    for (const t of BANK_TRANSACTIONS) {
      let playerId: number | null = null;

      // Resolve player code to ID
      if (t.p && codeToId[t.p]) {
        playerId = codeToId[t.p];
      }

      // If we have a valid player allocation, also find or skip the purchase link
      // (We don't create new purchase records here — they already exist from the main seed)
      const status = t.s;

      insertTxn.run(
        t.d,      // trans_date
        t.vd,     // value_date
        t.desc,   // description
        t.ref,    // reference
        t.dep,    // deposit
        t.wdl,    // withdrawal
        t.bal,    // balance
        status,   // status
        playerId, // allocated_player_id
        batch,    // import_batch
        t.n || null, // notes
      );

      if (status === "allocated") allocated++;
      else if (status === "ignored") ignored++;
      else unallocated++;
    }
  });

  tx();

  return NextResponse.json({
    message: "Bank transactions seeded successfully",
    seeded: true,
    total: BANK_TRANSACTIONS.length,
    allocated,
    ignored,
    unallocated,
  });
}
