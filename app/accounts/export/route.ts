import { requireAuth } from "@/lib/auth";
import { getLedgerTransactions } from "@/lib/db";
import { getCategoryLabel } from "@/lib/categories";
import { toCsv, csvResponse } from "@/lib/csv";

/** CSV export of the transactions behind one Income & Expenditure line. */
export async function GET(request: Request) {
  await requireAuth("admin");

  const url = new URL(request.url);
  const account = url.searchParams.get("account") || "";
  const isIncome = url.searchParams.get("income") === "1";
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  if (!account) return new Response("Missing account", { status: 400 });

  const headers = ["Date", "Description", "Detail", "Amount", "Source"];
  const rows = getLedgerTransactions(account, isIncome, { from, to }).map((r) => [
    r.trans_date, r.description, r.detail, r.amount, r.source,
  ]);

  const label = getCategoryLabel(account).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return csvResponse(`${label}-${isIncome ? "income" : "expense"}.csv`, toCsv(headers, rows));
}
