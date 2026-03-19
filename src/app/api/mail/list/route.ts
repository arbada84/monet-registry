/**
 * 메일 보도자료 목록 조회 API
 * GET /api/mail/list?account=all
 *
 * DB에 동기화된 메일 목록을 반환 (IMAP 직접 접속 X)
 * 동기화는 /api/mail/sync에서 수행
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";
import { serverGetSetting } from "@/lib/db-server";

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

interface StoredMail {
  uid: number;
  account: string;
  accountEmail: string;
  folder: string;
  from: string;
  subject: string;
  date: string;
  hasAttachments: boolean;
  attachmentNames: string[];
  status: string;
  articleId?: string;
  syncedAt: string;
}

interface MailSettingsDB {
  accounts?: { id: string; email: string; enabled: boolean }[];
}

export async function GET(req: NextRequest) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const accountFilter = sp.get("account") || "all";

  try {
    // DB에서 동기화된 메일 로드
    const stored = await serverGetSetting<StoredMail[]>("cp-mail-press-data", []);

    // 계정 목록
    const settings = await serverGetSetting<MailSettingsDB>("cp-mail-settings", {});
    let accountList: { id: string; email: string }[] = [];

    if (settings.accounts && settings.accounts.length > 0) {
      accountList = settings.accounts
        .filter((a) => a.enabled)
        .map((a) => ({ id: a.id, email: a.email }));
    } else {
      // 환경변수 폴백
      if (process.env.IMAP_USER_1) accountList.push({ id: "1", email: process.env.IMAP_USER_1 });
      if (process.env.IMAP_USER_2) accountList.push({ id: "2", email: process.env.IMAP_USER_2 });
    }

    // 계정 필터
    let filtered = stored;
    if (accountFilter !== "all") {
      filtered = stored.filter((m) => m.account === accountFilter);
    }

    // 이미 날짜 내림차순 정렬되어 있음
    return NextResponse.json({
      success: true,
      mails: filtered,
      accounts: accountList,
      total: stored.length,
    });
  } catch (e) {
    console.error("[mail/list] error:", e);
    return NextResponse.json({ success: false, error: "메일 목록 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
