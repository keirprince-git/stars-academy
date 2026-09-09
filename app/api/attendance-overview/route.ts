import { getAttendanceGrid } from "@/lib/db";

// Read-only attendance feed for the scheduled weekly recap. Guarded by a secret
// token held in the ATTENDANCE_FEED_TOKEN env var (set in Railway). No auth
// session needed so an automated task can fetch it, but useless without the token.
// Returns nothing if the token isn't configured on the server.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expected = process.env.ATTENDANCE_FEED_TOKEN;
  if (!expected) {
    return Response.json({ error: "feed disabled" }, { status: 503 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token || token !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const n = url.searchParams.get("n") === "4" ? 4 : 12;
  const grid = getAttendanceGrid(n);
  return Response.json(
    { generatedAt: new Date().toISOString(), n, ...grid },
    { headers: { "Cache-Control": "no-store" } }
  );
}
