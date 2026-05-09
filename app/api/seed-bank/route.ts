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

  const insertTxn = d.prepare(
    `INSERT INTO bank_transactions
       (trans_date, value_date, description, reference, deposit, withdrawal, balance,
        status, allocated_amount, import_batch, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const batch = "seed-from-spreadsheet";
  let allocated = 0;
  let ignored = 0;

  const tx = d.transaction(() => {
    for (const t of BANK_TRANSACTIONS) {
      // For allocated historical transactions, set allocated_amount = deposit
      // so they appear as fully allocated. No bank_allocations records needed
      // because the sessions_purchased records already exist from the main seed.
      const allocatedAmount = t.s === "allocated" ? t.dep : 0;

      insertTxn.run(
        t.d,             // trans_date
        t.vd,            // value_date
        t.desc,          // description
        t.ref,           // reference
        t.dep,           // deposit
        t.wdl,           // withdrawal
        t.bal,           // balance
        t.s,             // status
        allocatedAmount, // allocated_amount
        batch,           // import_batch
        t.n || "Historical - already in sessions purchased", // notes
      );

      if (t.s === "allocated") allocated++;
      else ignored++;
    }
  });

  tx();

  return NextResponse.json({
    message: "Bank transactions seeded successfully",
    seeded: true,
    total: BANK_TRANSACTIONS.length,
    allocated,
    ignored,
    unallocated: 0,
  });
}
