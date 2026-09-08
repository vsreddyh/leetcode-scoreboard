import { NextResponse } from "next/server";
import { getActiveDates, getOverallScores } from "@/lib/scores";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [totals, activeDates] = await Promise.all([getOverallScores(), getActiveDates()]);
    return NextResponse.json({ totals, activeDates });
  } catch {
    return NextResponse.json({ totals: [], activeDates: [] });
  }
}