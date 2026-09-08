// Web Crypto only — must stay Edge-compatible (imported by middleware).
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

async function hmac(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(username: string): Promise<string> {
  const exp = Date.now() + 1000 * 60 * 60 * 12; // 12h
  return `${username}.${exp}.${await hmac(`${username}.${exp}`)}`;
}

export async function verifySession(cookieVal: string | undefined): Promise<string | null> {
  if (!cookieVal) return null;
  const parts = cookieVal.split(".");
  if (parts.length !== 3) return null;
  const [username, exp, sig] = parts;
  if (Number(exp) < Date.now()) return null;
  const expected = await hmac(`${username}.${exp}`);
  if (!ctEqual(sig, expected)) return null;
  return username;
}

export function checkCredentials(password: string): boolean {
  const p = process.env.ADMIN_PASSWORD ?? "";
  return password === p && p.length > 0;
}

export const ADMIN_COOKIE = COOKIE;
