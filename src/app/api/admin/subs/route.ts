import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin";
import { connectDB } from "@/lib/db";
import { Submission } from "@/models/Submission";

export async function GET() {
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifySession(c)))
    return NextResponse.json({ ok: false }, { status: 401 });
  try {
    await connectDB();
    const subs = await Submission.find()
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();
    return NextResponse.json({ subs });
  } catch (err) {
    console.error(`[subs] failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}