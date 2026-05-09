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
        status, allocated_amount, import_batch, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertAllocation = d.prepare(
    `INSERT INTO bank_allocations
       (bank_transaction_id, player_id, amount, sessions_purchased, package, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const batch = "seed-from-spreadsheet";
  let allocated = 0;
  let ignored = 0;
  let unallocated = 0;

  const tx = d.transaction(() => {
    for (const t of BANK_TRANSACTIONS) {
      const playerId = t.p && codeToId[t.p] ? codeToId[t.p] : null;
      const status = t.s;
      const allocatedAmount = (status === "allocated" && playerId) ? t.dep : 0;

      const result = insertTxn.run(
        t.d,      // trans_date
        t.vd,     // value_date
        t.desc,   // description
        t.ref,    // reference
        t.dep,    // deposit
        t.wdl,    // withdrawal
        t.bal,    // balance
        status,   // status
        allocatedAmount, // allocated_amount
        batch,    // import_batch
        t.n || null, // notes
      );

      // If allocated to a player, create an allocation record (but NOT a sessions_purchased
      // record, since those already exist from the main seed)
      if (status === "allocated" && playerId) {
        insertAllocation.run(
          result.lastInsertRowid, // bank_transaction_id
          playerId,               // player_id
          t.dep,                  // amount (full deposit for single-player allocations)
          0,                      // sessions_purchased (0 = linked to existing purchase from main seed)
          null,                   // package
          "Seeded from spreadsheet", // notes
        );
      }

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
