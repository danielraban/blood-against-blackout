import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "openchair_admin";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export async function isAdmin() {
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!value || !secret) return false;

  const [expiresRaw, signature] = value.split(".");
  const expires = Number(expiresRaw);
  if (
    !expiresRaw ||
    !signature ||
    !Number.isSafeInteger(expires) ||
    expires <= Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  return safeEqual(signature, sign(expiresRaw, secret));
}

export function adminCookieHeader() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not set");
  }
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const value = `${expires}.${sign(String(expires), secret)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export function clearAdminCookieHeader() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function checkAdminPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected && password && safeEqual(hash(password), hash(expected)));
}

export function checkCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return Boolean(header && safeEqual(hash(header), hash(`Bearer ${expected}`)));
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function safeEqual(left: string | Buffer, right: string | Buffer) {
  const leftBuffer = typeof left === "string" ? Buffer.from(left) : left;
  const rightBuffer = typeof right === "string" ? Buffer.from(right) : right;
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
