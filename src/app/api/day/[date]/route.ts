import { NextResponse } from "next/server";
import { getDayDetail } from "@/lib/scores";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  try {
    return NextResponse.json({ questions: await getDayDetail(date) });
  } catch {
    return NextResponse.json({ questions: [] });
  }
}