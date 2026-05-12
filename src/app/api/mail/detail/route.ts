/**
 * 메일 상세 조회 API
 * GET /api/mail/detail?uid=123&account=1
 *
 * IMAP으로 특정 메일의 전체 본문 + 첨부파일 파싱
 * - DOCX → mammoth → HTML
 * - PDF → pdf-parse → 텍스트
 * - 이미지 → Supabase 업로드
 */
import { NextRequest, NextResponse } from "next/server";
import type { Attachment } from "mailparser";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";
import { serverUploadBuffer } from "@/lib/server-upload-image";
import { serverGetSetting } from "@/lib/db-server";
import { decrypt } from "@/lib/encrypt";

// 인증
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

async function getAccount(id: string) {
  // 1) DB 설정에서 계정 찾기
  const dbSettings = await serverGetSetting<{
    accounts?: { id: string; email: string; password: string; host: string; port: number; enabled: boolean }[];
  }>("cp-mail-settings", {});

  if (dbSettings.accounts && dbSettings.accounts.length > 0) {
    const acc = dbSettings.accounts.find((a) => a.id === id && a.enabled);
    if (acc) return { host: acc.host || "imap.daum.net", port: acc.port || 993, user: acc.email, pass: decrypt(acc.password) };
  }

  // 2) 환경변수 폴백
  const host = process.env.IMAP_HOST || "imap.daum.net";
  const port = parseInt(process.env.IMAP_PORT || "993");
  if (id === "1" && process.env.IMAP_USER_1 && process.env.IMAP_PASS_1) {
    return { host, port, user: process.env.IMAP_USER_1, pass: process.env.IMAP_PASS_1 };
  }
  if (id === "2" && process.env.IMAP_USER_2 && process.env.IMAP_PASS_2) {
    return { host, port, user: process.env.IMAP_USER_2, pass: process.env.IMAP_PASS_2 };
  }
  return null;
}

interface ParsedAttachment {
  name: string;
  type: string; // "docx" | "pdf" | "hwp" | "image" | "other"
  content: string; // HTML or text content (for docs), URL (for images)
  mimeType: string;
}

async function processAttachment(att: Attachment): Promise<ParsedAttachment | null> {
  const filename = att.filename || "unknown";
  const lower = filename.toLowerCase();
  const buf = att.content;

  // DOCX → HTML via mammoth
  if (lower.endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ buffer: buf });
      return { name: filename, type: "docx", content: result.value, mimeType: att.contentType };
    } catch (e) {
      console.error("[mail/detail] DOCX 변환 실패:", e instanceof Error ? e.message : e);
      return { name: filename, type: "docx", content: "<p>DOCX 파일 변환에 실패했습니다.</p>", mimeType: att.contentType };
    }
  }

  // PDF → 텍스트
  if (lower.endsWith(".pdf")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buf);
      const paragraphs = result.text
        .split(/\n\s*\n/)
        .filter((p: string) => p.trim())
        .map((p: string) => `<p>${p.trim().replace(/\n/g, "<br/>")}</p>`)
        .join("\n");
      return { name: filename, type: "pdf", content: paragraphs, mimeType: att.contentType };
    } catch (e) {
      console.error("[mail/detail] PDF 파싱 실패:", e instanceof Error ? e.message : e);
      return { name: filename, type: "pdf", content: "<p>PDF 파일 파싱에 실패했습니다.</p>", mimeType: att.contentType };
    }
  }

  // HWP → 텍스트 추출 시도
  if (lower.endsWith(".hwp") || lower.endsWith(".hwpx")) {
    return { name: filename, type: "hwp", content: "<p>HWP 첨부파일 — 수동 확인이 필요합니다.</p>", mimeType: att.contentType };
  }

  // 이미지 → Supabase 업로드
  if (att.contentType?.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp)$/i.test(lower)) {
    try {
      const url = await serverUploadBuffer(new Uint8Array(buf), filename);
      if (url) {
        return { name: filename, type: "image", content: url, mimeType: att.contentType };
      }
    } catch {
      // 업로드 실패
    }
    return null;
  }

  return null; // 기타 첨부파일 무시
}

export async function GET(req: NextRequest) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const uid = parseInt(sp.get("uid") || "0");
  const accountId = sp.get("account") || "1";
  const folder = sp.get("folder") || "INBOX";

  if (!uid) {
    return NextResponse.json({ success: false, error: "uid 파라미터가 필요합니다." }, { status: 400 });
  }

  const account = await getAccount(accountId);
  if (!account) {
    return NextResponse.json({ success: false, error: "유효하지 않은 계정입니다." }, { status: 400 });
  }

  const [{ ImapFlow }, { simpleParser }] = await Promise.all([
    import("imapflow"),
    import("mailparser"),
  ]);

  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);

    try {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !("source" in msg) || !msg.source) {
        return NextResponse.json({ success: false, error: "메일을 찾을 수 없습니다." }, { status: 404 });
      }

      const parsed = await simpleParser(msg.source as Buffer);

      // 본문 HTML
      let bodyHtml = parsed.html || "";
      if (!bodyHtml && parsed.text) {
        bodyHtml = parsed.text
          .split(/\n\s*\n/)
          .filter((p) => p.trim())
          .map((p) => `<p>${p.trim().replace(/\n/g, "<br/>")}</p>`)
          .join("\n");
      }

      // 첨부파일 처리
      const attachments: ParsedAttachment[] = [];
      const images: string[] = [];

      if (parsed.attachments && parsed.attachments.length > 0) {
        for (const att of parsed.attachments) {
          const result = await processAttachment(att);
          if (result) {
            if (result.type === "image") {
              images.push(result.content); // content = Supabase URL
            }
            attachments.push(result);
          }
        }
      }

      return NextResponse.json({
        success: true,
        subject: parsed.subject || "(제목 없음)",
        from: parsed.from?.text || "",
        date: parsed.date?.toISOString() || "",
        bodyHtml,
        bodyText: parsed.text || "",
        attachments,
        images,
      });
    } finally {
      lock.release();
    }
  } catch (e) {
    console.error("[mail/detail] error:", e);
    return NextResponse.json({
      success: false,
      error: "메일 상세 조회 중 오류가 발생했습니다.",
    }, { status: 500 });
  } finally {
    await client.logout().catch(() => {});
  }
}

export const maxDuration = 60;
