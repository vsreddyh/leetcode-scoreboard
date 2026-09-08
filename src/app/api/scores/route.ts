import { NextResponse } from "next/server";
import { getScores } from "@/lib/scores";

export const dynamic = "force-dynamic";

// GET /api/scores — daily sums + totals per user from Mongo
export async function GET() {
  try {
    return NextResponse.json(await getScores());
  } catch (e) {
    return NextResponse.json(
      { daily: [], totals: [], error: e instanceof Error ? e.message : "db error" },
      { status: 200 }
    );
  }
}
