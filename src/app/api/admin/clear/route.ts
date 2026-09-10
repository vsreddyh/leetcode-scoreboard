import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { Submission } from "@/models/Submission";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifySession(c)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  await connectDB();
  const res = await Submission.deleteMany({});
  return NextResponse.json({ ok: true, deleted: res.deletedCount });
}