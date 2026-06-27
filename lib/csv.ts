/* ── CSV helper for downloadable transaction listings ──
   Builds an Excel-friendly CSV: fields escaped per RFC 4180, CRLF line
   endings, and a UTF-8 BOM so Excel renders the ₦ symbol correctly. */

type Cell = string | number | null | undefined;

function esc(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
