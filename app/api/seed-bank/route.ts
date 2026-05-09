import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Bank seed endpoint disabled. Database already seeded." },
    { status: 403 }
  );
}
