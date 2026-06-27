import { requireAuth } from "@/lib/auth";
import { getMonthlySummary } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";

/** CSV of the month-by-month roll-up, for trend analysis in a spreadsheet. */
export async function GET() {
  await requireAuth("admin");

  const headers = [
    "Month", "Cash income", "Cash expenses", "Cash surplus", "Earned session revenue (accruals)",
    "Sessions held", "Attendances", "Revenue per session (earned)", "Attendance per session",
  ];
  const rows = getMonthlySummary().map((r) => [
    r.month, r.income, r.expenses, r.surplus, r.earnedRevenue,
    r.sessionsHeld, r.attendances, r.revenuePerSession, r.attendancePerSession,
  ]);

  return csvResponse(`monthly-summary-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
}
