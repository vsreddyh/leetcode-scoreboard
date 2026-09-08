import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Submission } from "@/models/Submission";

export const dynamic = "force-dynamic";

export async function DELETE() {
  await connectDB();
  const res = await Submission.deleteMany({});
  return NextResponse.json({ ok: true, deleted: res.deletedCount });
}