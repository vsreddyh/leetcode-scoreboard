import { NextResponse } from "next/server";
import { getActiveDates, getOverallScores } from "@/lib/scores";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [totals, activeDates] = await Promise.all([getOverallScores(), getActiveDates()]);
    return NextResponse.json({ totals, activeDates });
  } catch (err) {
    console.error(`[overall] failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(
      { totals: [], activeDates: [], error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}