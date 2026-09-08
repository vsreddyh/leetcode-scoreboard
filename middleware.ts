import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, ADMIN_COOKIE } from "@/lib/admin";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();
  if (pathname.startsWith("/admin")) {
    const user = verifySession(req.cookies.get(ADMIN_COOKIE)?.value);
    if (!user) return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
