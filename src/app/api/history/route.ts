import { NextResponse } from "next/server";
import { getScoreHistory } from "@/lib/scores";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const history = await getScoreHistory();
    return NextResponse.json({ history });
  } catch (err) {
    console.error(`[history] failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(
      { history: [], error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
