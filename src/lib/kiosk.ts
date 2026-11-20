import "server-only";
import { cookies, headers } from "next/headers";

export const KIOSK_COOKIE = "bohemia_kiosk";
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|webOS|BlackBerry/i;

export async function getKioskToken(): Promise<string | null> {
  const c = await cookies();
  return c.get(KIOSK_COOKIE)?.value ?? null;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip");
}

export async function isMobileRequest(): Promise<boolean> {
  const h = await headers();
  return MOBILE_UA.test(h.get("user-agent") ?? "");
}
