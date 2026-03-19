/**
 * 메일 연결 테스트 API
 * POST /api/mail/test
 */
import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";

async function authenticate(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const bearer = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    if (bearer && timingSafeEqual(bearer, secret)) return true;
  }
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

export async function POST(req: NextRequest) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { host, port, email, password } = body as {
      host: string;
      port: number;
      email: string;
      password: string;
    };

    if (!host || !email || !password) {
      return NextResponse.json({ success: false, error: "필수 정보가 누락되었습니다." }, { status: 400 });
    }

    const client = new ImapFlow({
      host,
      port: port || 993,
      secure: true,
      auth: { user: email, pass: password },
      logger: false,
    });

    try {
      await client.connect();

      // 메일함 목록 조회
      const mailboxes = await client.list();
      const folderNames = mailboxes.map((mb) => mb.path);

      // INBOX 메시지 수 확인
      const lock = await client.getMailboxLock("INBOX");
      const totalMessages = (client.mailbox as { exists?: number }).exists || 0;
      lock.release();

      await client.logout();

      return NextResponse.json({
        success: true,
        folders: folderNames,
        totalMessages,
      });
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: e instanceof Error ? e.message : "IMAP 연결 실패",
      });
    } finally {
      await client.logout().catch(() => {});
    }
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : "요청 처리 실패",
    }, { status: 500 });
  }
}
