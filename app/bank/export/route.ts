import { requireAuth } from "@/lib/auth";
import { getBankTransactions, getBankAllocations, getSplitsByTxnIds } from "@/lib/db";
import { getCategoryLabel } from "@/lib/categories";
import { toCsv, csvResponse } from "@/lib/csv";

/** CSV export of the bank transactions table, honouring status/search/batch filters. */
export async function GET(request: Request) {
  await requireAuth("admin");

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || undefined;
  const batch = url.searchParams.get("batch") || undefined;

  const txns = getBankTransactions({ status, search, batch });
  const splitsByTxn = getSplitsByTxnIds(txns.map((t) => t.id));

  const headers = [
    "Date", "Value date", "Description", "Reference",
    "Deposit", "Withdrawal", "Balance", "Status",
    "Allocated amount", "Allocated to", "Categories",
  ];
  const rows = txns.map((t) => {
    const allocs = t.status === "allocated" || t.status === "partial" ? getBankAllocations(t.id) : [];
    const allocatedTo = allocs.map((a) => `${a.player_name} (₦${a.amount})`).join("; ");
    const cats = (splitsByTxn[t.id] ?? []).map((s) => `${getCategoryLabel(s.category)} (₦${s.amount})`).join("; ");
    return [
      t.trans_date, t.value_date, t.description, t.reference,
      t.deposit, t.withdrawal, t.balance, t.status,
      t.allocated_amount, allocatedTo, cats,
    ];
  });

  return csvResponse(`bank-transactions-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
}
