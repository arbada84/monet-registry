import { NextRequest } from "next/server";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";

interface Subscriber {
  id: string;
  email: string;
  name: string;
  subscribedAt: string;
  status: "active" | "unsubscribed";
  token?: string;
}

// GET /api/newsletter/unsubscribe?token=xxx
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>구독 해제</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;color:#333;">
  <h2>잘못된 요청</h2>
  <p>유효하지 않은 구독 해제 링크입니다.</p>
</body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    const subs = await serverGetSetting<Subscriber[]>("cp-newsletter-subscribers", []);
    const updated = subs.map((s) =>
      s.token === token ? { ...s, status: "unsubscribed" as const } : s
    );

    const found = subs.some((s) => s.token === token && s.status === "active");

    if (!found) {
      return new Response(
        `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>구독 해제</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;color:#333;">
  <h2>이미 처리된 요청</h2>
  <p>이미 구독 해제되었거나 잘못된 링크입니다.</p>
</body></html>`,
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    await serverSaveSetting("cp-newsletter-subscribers", updated);

    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>구독 해제 완료</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;color:#333;">
  <h2 style="color:#E8192C;">구독이 해제되었습니다.</h2>
  <p>더 이상 뉴스레터를 받지 않습니다.</p>
  <a href="/" style="display:inline-block;margin-top:20px;padding:10px 24px;background:#E8192C;color:#FFF;text-decoration:none;border-radius:6px;">홈으로 돌아가기</a>
</body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (e) {
    console.error("[newsletter/unsubscribe]", e);
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>오류</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;color:#333;">
  <h2>서버 오류</h2>
  <p>잠시 후 다시 시도해주세요.</p>
</body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
