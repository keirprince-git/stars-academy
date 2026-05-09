import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Seed endpoint disabled. Database already seeded." },
    { status: 403 }
  );
}
