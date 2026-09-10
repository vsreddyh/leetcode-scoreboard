import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, ADMIN_COOKIE } from "@/lib/admin";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();
  if (pathname.startsWith("/admin")) {
    let user: string | null = null;
    try {
      user = await verifySession(req.cookies.get(ADMIN_COOKIE)?.value);
    } catch {
      user = null;
    }
    if (!user) return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
