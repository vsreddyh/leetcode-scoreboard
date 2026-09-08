import { createHmac, timingSafeEqual } from "crypto";

const COOKIE = "lc_admin";

function secret() {
  const s = process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "";
  if (!s) throw new Error("ADMIN_SESSION_SECRET or ADMIN_PASSWORD not set");
  return s;
}

export function signSession(username: string): string {
  const exp = Date.now() + 1000 * 60 * 60 * 12; // 12h
  const payload = `${username}.${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySession(cookieVal: string | undefined): string | null {
  if (!cookieVal) return null;
  const parts = cookieVal.split(".");
  if (parts.length !== 3) return null;
  const [username, exp, sig] = parts;
  if (Number(exp) < Date.now()) return null;
  const expected = createHmac("sha256", secret()).update(`${username}.${exp}`).digest();
  const got = Buffer.from(sig, "hex");
  if (got.length !== expected.length) return null;
  if (!timingSafeEqual(got, expected)) return null;
  return username;
}

export function checkCredentials(password: string): boolean {
  const p = process.env.ADMIN_PASSWORD ?? "";
  return password === p && p.length > 0;
}

export const ADMIN_COOKIE = COOKIE;
