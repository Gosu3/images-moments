import { cookies } from "next/headers";

const COOKIE_NAME = "wm_admin";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) throw new Error("AUTH_SECRET is not configured");
  return value;
}

function bytes(value: string) { return new TextEncoder().encode(value); }
function base64url(value: ArrayBuffer) {
  return Buffer.from(value).toString("base64url");
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey("raw", bytes(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await crypto.subtle.sign("HMAC", key, bytes(payload)));
}

export async function createAdminSession() {
  const payload = `admin.${Math.floor(Date.now() / 1000) + SESSION_SECONDS}`;
  return `${payload}.${await sign(payload)}`;
}

export async function validAdminSession(value?: string) {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "admin") return false;
  const payload = `${parts[0]}.${parts[1]}`;
  if (!Number.isFinite(Number(parts[1])) || Number(parts[1]) <= Date.now() / 1000) return false;
  const expected = await sign(payload);
  if (expected.length !== parts[2].length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ parts[2].charCodeAt(i);
  return difference === 0;
}

export async function isVercelAdmin() {
  return validAdminSession((await cookies()).get(COOKIE_NAME)?.value);
}

export function adminCookie(value: string) {
  return { name: COOKIE_NAME, value, httpOnly: true, secure: true, sameSite: "strict" as const, path: "/", maxAge: SESSION_SECONDS };
}

export function expiredAdminCookie() {
  return { ...adminCookie(""), maxAge: 0 };
}

export async function passwordMatches(candidate: string) {
  const configured = process.env.ADMIN_PASSWORD ?? "";
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", bytes(candidate)),
    crypto.subtle.digest("SHA-256", bytes(configured)),
  ]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) difference |= a[i] ^ b[i];
  return configured.length >= 12 && difference === 0;
}
