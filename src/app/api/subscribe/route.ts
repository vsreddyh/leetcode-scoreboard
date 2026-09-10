import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PushSub } from "@/models/PushSub";
import { getVapidPublicKey } from "@/lib/push";

export async function GET() {
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth)
    return NextResponse.json({ ok: false, error: "invalid subscription" }, { status: 400 });
  await connectDB();
  // Single notification type: everything is per-sync.
  await PushSub.updateOne(
    { endpoint },
    { $set: { endpoint, keys, mode: "per-sync" } },
    { upsert: true }
  );
  return NextResponse.json({ ok: true, mode: "per-sync" });
}

export async function DELETE(req: Request) {
  const { endpoint } = await req.json().catch(() => ({}));
  if (!endpoint)
    return NextResponse.json({ ok: false, error: "endpoint required" }, { status: 400 });
  await connectDB();
  await PushSub.deleteOne({ endpoint });
  return NextResponse.json({ ok: true });
}