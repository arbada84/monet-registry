// 임시 진단 엔드포인트 - 배포 후 삭제 예정
import { NextResponse } from "next/server";

export async function GET() {
  const PHP_API_URL = process.env.PHP_API_URL;
  const PHP_API_SECRET = process.env.PHP_API_SECRET;
  const PHP_API_HOST = process.env.PHP_API_HOST;

  const result: Record<string, unknown> = {
    hasUrl: Boolean(PHP_API_URL),
    hasSecret: Boolean(PHP_API_SECRET),
    secretLength: PHP_API_SECRET?.length,
    url: PHP_API_URL,
    host: PHP_API_HOST,
  };

  if (!PHP_API_URL || !PHP_API_SECRET) {
    return NextResponse.json({ ...result, error: "env vars missing" });
  }

  try {
    const url = new URL(PHP_API_URL);
    url.searchParams.set("action", "ping");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PHP_API_SECRET}`,
    };
    if (PHP_API_HOST) headers["Host"] = PHP_API_HOST;

    const res = await fetch(url.toString(), { method: "GET", headers, cache: "no-store" });
    const text = await res.text();
    result.pingStatus = res.status;
    result.pingBody = text.slice(0, 200);
  } catch (e) {
    result.pingError = String(e);
  }

  try {
    const url = new URL(PHP_API_URL);
    url.searchParams.set("action", "settings");
    url.searchParams.set("key", "cp-admin-accounts");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PHP_API_SECRET}`,
    };
    if (PHP_API_HOST) headers["Host"] = PHP_API_HOST;

    const res = await fetch(url.toString(), { method: "GET", headers, cache: "no-store" });
    const text = await res.text();
    result.settingsStatus = res.status;
    result.settingsBody = text.slice(0, 300);
  } catch (e) {
    result.settingsError = String(e);
  }

  return NextResponse.json(result);
}
