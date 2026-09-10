import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin";

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/admin/login", req.url));
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}

export async function GET(req: Request) {
  return POST(req);
}
