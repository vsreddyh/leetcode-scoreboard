// Web Crypto only — must stay Edge-compatible (imported by proxy).
const COOKIE = "lc_admin";

function secret() {
  const s = process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "";
  if (!s) throw new Error("ADMIN_SESSION_SECRET or ADMIN_PASSWORD not set");
  return s;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(payload: string): Promise<string> {
  return hmacWith(secret(), payload);
}

async function hmacWith(sec: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(sec),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

export async function signSession(username: string): Promise<string> {
  const exp = Date.now() + 1000 * 60 * 60 * 12; // 12h
  return `${username}.${exp}.${await hmac(`${username}.${exp}`)}`;
}

export async function verifySession(cookieVal: string | undefined): Promise<string | null> {
  if (!cookieVal) return null;
  let sec: string;
  try {
    sec = secret();
  } catch {
    return null;
  }
  const parts = cookieVal.split(".");
  if (parts.length !== 3) return null;
  const [username, exp, sig] = parts;
  if (!username || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  let expected: string;
  try {
    expected = await hmacWith(sec, `${username}.${exp}`);
  } catch {
    return null;
  }
  if (!ctEqual(sig, expected)) return null;
  return username;
}

/** Password login needs its own compare that works the same on both runtimes. */
export async function checkCredentials(password: string): Promise<boolean> {
  const p = process.env.ADMIN_PASSWORD ?? "";
  if (!p) return false;
  try {
    const a = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(p));
    return ctEqual(toHex(a), toHex(b));
  } catch {
    return false;
  }
}

export const ADMIN_COOKIE = COOKIE;

/** Constant-time string comparison for secrets (Edge + Node safe). */
export function safeEqual(a: string, b: string): boolean {
  return ctEqual(a, b);
}
