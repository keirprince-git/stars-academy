import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { db, DB_PATH } from "@/lib/db";
import { getOptionalAuth } from "@/lib/auth";

/**
 * Download a consistent backup of the SQLite database.
 * GET /api/backup  →  stars_academy_backup_YYYY-MM-DD_HHMM.db
 *
 * Admin only. Uses SQLite's VACUUM INTO so the copy is transactionally
 * consistent and compacted, rather than a raw file copy that could catch
 * a write mid-flight.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getOptionalAuth();
  if (!auth) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  // Timestamp the filename so successive downloads don't overwrite each other.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filename = `stars_academy_backup_${stamp}.db`;

  // VACUUM INTO refuses to overwrite, so write to a fresh temp path.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stars-backup-"));
  const tmpFile = path.join(tmpDir, filename);

  try {
    db().prepare("VACUUM INTO ?").run(tmpFile);
    const buf = fs.readFileSync(tmpFile);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "no-store",
        "X-Source-Db": path.basename(DB_PATH),
      },
    });
  } catch (err) {
    console.error("[backup] failed:", err);
    return NextResponse.json(
      { error: "Backup failed.", detail: String(err) },
      { status: 500 }
    );
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* temp dir cleanup is best-effort */
    }
  }
}
