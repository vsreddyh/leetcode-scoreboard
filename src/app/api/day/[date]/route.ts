import { NextResponse } from "next/server";
import { isValidDayKey } from "@/lib/leetcode";
import { getDayDetail } from "@/lib/scores";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  // Same validity rule as getActiveDates and the chart filter, so all three
  // read paths agree on what a "date" is.
  if (!isValidDayKey(date))
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  try {
    return NextResponse.json({ questions: await getDayDetail(date) });
  } catch (err) {
    console.error(`[day/${date}] failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(
      { questions: [], error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}