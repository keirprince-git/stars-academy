import { getPlayersNeedingChase } from "@/lib/db";
import { buildChaseMessage, buildWhatsAppLink } from "@/lib/whatsapp";

// Read-only feed of players at zero credit or overdue, for the scheduled
// payment-chase reminder. Guarded by the same ATTENDANCE_FEED_TOKEN env var as
// the attendance feed. Each row carries a ready-made WhatsApp click-to-chat
// link (pre-filled chase message) so a chase is one tap from the reminder.
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

  const players = getPlayersNeedingChase().map((p) => ({
    code: p.code,
    name: p.name,
    age_group: p.source,
    sessions_paid: p.sessions_paid,
    sessions_attended: p.sessions_attended,
    balance: p.balance,
    status: p.balance < 0 ? "OVERDUE" : "Fully used",
    parent_name: p.parent_name,
    has_phone: !!p.parent_phone,
    chase_url: p.parent_phone
      ? buildWhatsAppLink(
          p.parent_phone,
          buildChaseMessage({ playerName: p.name, balance: p.balance, parentName: p.parent_name, ageGroup: p.source })
        )
      : null,
  }));

  return Response.json(
    { generatedAt: new Date().toISOString(), count: players.length, players },
    { headers: { "Cache-Control": "no-store" } }
  );
}
