import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PLAYERS, PURCHASES, ATTENDANCE } from "@/lib/seed-data";

export async function GET(request: Request) {
  // Simple auth check via query param — only works if you know the secret
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key !== "stars2026seed") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if already seeded
  const count = db().prepare("SELECT COUNT(*) as c FROM players").get() as { c: number };
  if (count.c > 0) {
    return NextResponse.json({
      message: `Database already has ${count.c} players. Delete them first if you want to re-seed.`,
      seeded: false,
    });
  }

  const d = db();

  // Insert players
  const insertPlayer = d.prepare(
    `INSERT INTO players (id, code, name, country, source, play_status, scholarship, notes)
     VALUES (@id, @code, @name, @country, @source, @play_status, @scholarship, @notes)`
  );

  const insertPurchase = d.prepare(
    `INSERT INTO sessions_purchased (player_id, purchase_date, type, amount_paid, sessions_purchased, package, bank_ref, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertAttendance = d.prepare(
    `INSERT INTO attendance_log (player_id, session_date, attended) VALUES (?, ?, ?)`
  );

  const tx = d.transaction(() => {
    // Players
    for (const p of PLAYERS) {
      insertPlayer.run({
        id: p.id,
        code: p.code,
        name: p.name,
        country: p.country,
        source: p.source,
        play_status: p.play_status,
        scholarship: p.scholarship,
        notes: p.notes,
      });
    }

    // Purchases
    for (const pr of PURCHASES) {
      insertPurchase.run(pr.p, pr.d, pr.t, pr.a, pr.s, pr.pk, pr.b, pr.n);
    }

    // Attendance
    for (const sess of ATTENDANCE) {
      const attendedSet = new Set(sess.a);
      for (const pid of sess.all) {
        insertAttendance.run(pid, sess.d, attendedSet.has(pid) ? 1 : 0);
      }
    }
  });

  tx();

  return NextResponse.json({
    message: "Database seeded successfully",
    seeded: true,
    players: PLAYERS.length,
    purchases: PURCHASES.length,
    attendance_sessions: ATTENDANCE.length,
  });
}
