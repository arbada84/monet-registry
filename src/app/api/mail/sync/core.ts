/**
 * 메일 동기화 핵심 로직
 * route.ts에서 HTTP 핸들러로 사용, auto-press에서 직접 호출
 */
import { ImapFlow } from "imapflow";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { decrypt } from "@/lib/encrypt";
import { notifyTelegramMailSync } from "@/lib/telegram-notify";

interface MailAccountSetting {
  id: string;
  email: string;
  password: string;
  host: string;
  port: number;
  enabled: boolean;
  folders: string[];
  filterRecipient: boolean;
}

interface MailSettingsDB {
  accounts?: MailAccountSetting[];
}

export interface StoredMail {
  uid: number;
  account: string;
  accountEmail: string;
  folder: string;
  from: string;
  subject: string;
  date: string;
  hasAttachments: boolean;
  attachmentNames: string[];
  status: "pending" | "imported" | "skipped";
  articleId?: string;
  syncedAt: string;
}

const SETTINGS_KEY = "cp-mail-press-data";
const MAX_STORED = 2000;

async function getAccounts(): Promise<MailAccountSetting[]> {
  const dbSettings = await serverGetSetting<MailSettingsDB>("cp-mail-settings", {});
  if (dbSettings.accounts && dbSettings.accounts.length > 0) {
    return dbSettings.accounts
      .filter((a) => a.enabled && a.email && a.password)
      .map((a) => {
        try {
          return { ...a, password: decrypt(a.password) };
        } catch {
          console.error(`[mail/sync] 계정 ${a.email} 비밀번호 복호화 실패 — 건너뜀`);
          return null;
        }
      })
      .filter((a): a is MailAccountSetting => a !== null);
  }

  const accounts: MailAccountSetting[] = [];
  const host = process.env.IMAP_HOST || "imap.daum.net";
  const port = parseInt(process.env.IMAP_PORT || "993");
  if (process.env.IMAP_USER_1 && process.env.IMAP_PASS_1) {
    accounts.push({ id: "1", email: process.env.IMAP_USER_1, password: process.env.IMAP_PASS_1, host, port, enabled: true, folders: [], filterRecipient: false });
  }
  if (process.env.IMAP_USER_2 && process.env.IMAP_PASS_2) {
    accounts.push({ id: "2", email: process.env.IMAP_USER_2, password: process.env.IMAP_PASS_2, host, port, enabled: true, folders: [], filterRecipient: false });
  }
  return accounts;
}

/** 단일 계정에서 새 메일을 가져온다 */
async function syncAccount(
  account: MailAccountSetting,
  days: number,
  existingKeys: Set<string>,
): Promise<{ newMails: StoredMail[]; skipped: number; errors: string[] }> {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.email, pass: account.password },
    logger: false,
  });

  const newMails: StoredMail[] = [];
  const errors: string[] = [];
  let skipped = 0;

  try {
    await client.connect();

    // 폴더 결정
    let folders: string[];
    if (account.folders && account.folders.length > 0) {
      folders = account.folders;
    } else {
      folders = ["INBOX"];
      const mailboxes = await client.list();
      const systemFolders = ["INBOX", "Sent Messages", "Drafts", "Deleted Messages", "스팸편지함", "내게쓴편지함"];
      for (const mb of mailboxes) {
        if (!systemFolders.includes(mb.path)) folders.push(mb.path);
      }
    }

    for (const folder of folders) {
      try {
        const lock = await client.getMailboxLock(folder);
        try {
          const mbx = client.mailbox as { exists?: number };
          if (!mbx || mbx.exists === 0) continue;

          const since = new Date();
          since.setDate(since.getDate() - days);

          const messages = client.fetch(
            { since },
            { uid: true, envelope: true, bodyStructure: true },
          );

          for await (const msg of messages) {
            try {
              const env = msg.envelope;
              if (!env) continue;

              const key = `${account.id}:${folder}:${msg.uid}`;
              if (existingKeys.has(key)) {
                skipped++;
                continue;
              }

              // 수신자 필터
              if (account.filterRecipient) {
                const toAddrs = (env.to || []).map((t: { address?: string }) => t.address?.toLowerCase() || "");
                const ccAddrs = (env.cc || []).map((c: { address?: string }) => c.address?.toLowerCase() || "");
                if (![...toAddrs, ...ccAddrs].some((addr: string) => addr === account.email.toLowerCase())) {
                  skipped++;
                  continue;
                }
              }

              const fromAddr = env.from?.[0]?.address || "";
              const fromName = env.from?.[0]?.name || fromAddr;

              const attachmentNames: string[] = [];
              function extractAttachments(struct: unknown) {
                if (!struct || typeof struct !== "object") return;
                const s = struct as Record<string, unknown>;
                if (s.disposition === "attachment" || s.disposition === "inline") {
                  const params = s.dispositionParameters as Record<string, string> | undefined;
                  const fname = params?.filename || (s.parameters as Record<string, string> | undefined)?.name;
                  if (fname) attachmentNames.push(fname);
                }
                if (Array.isArray(s.childNodes)) {
                  for (const child of s.childNodes) extractAttachments(child);
                }
              }
              extractAttachments(msg.bodyStructure);

              newMails.push({
                uid: msg.uid,
                account: account.id,
                accountEmail: account.email,
                folder,
                from: fromName !== fromAddr ? `${fromName} <${fromAddr}>` : fromAddr,
                subject: env.subject || "(제목 없음)",
                date: env.date?.toISOString() || "",
                hasAttachments: attachmentNames.length > 0,
                attachmentNames,
                status: "pending",
                syncedAt: new Date().toISOString(),
              });

              existingKeys.add(key); // 같은 실행 내 중복 방지
            } catch {
              // 개별 메일 무시
            }
          }
        } finally {
          lock.release();
        }
      } catch (e) {
        errors.push(`${account.email}/${folder}: ${e instanceof Error ? e.message : "조회 실패"}`);
      }
    }
  } catch (e) {
    errors.push(`${account.email}: ${e instanceof Error ? e.message : "연결 실패"}`);
  } finally {
    await client.logout().catch(() => {});
  }

  return { newMails, skipped, errors };
}

/** 메일 동기화 핵심 로직 — auto-press에서 직접 호출 가능 */
export async function runMailSync(days: number): Promise<{ synced: number; total: number; errors?: string[] }> {
  const safeDays = Math.min(Math.max(1, days), 730);
  const accounts = await getAccounts();
  if (accounts.length === 0) {
    throw new Error("IMAP 계정이 설정되지 않았습니다.");
  }

  const stored = await serverGetSetting<StoredMail[]>(SETTINGS_KEY, []);
  const existingKeys = new Set(stored.map((m) => `${m.account}:${m.folder}:${m.uid}`));

  const allNewMails: StoredMail[] = [];
  const allErrors: string[] = [];

  for (const account of accounts) {
    const result = await syncAccount(account, safeDays, existingKeys);
    allNewMails.push(...result.newMails);
    allErrors.push(...result.errors);
  }

  const merged = [...allNewMails, ...stored]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, MAX_STORED);

  await serverSaveSetting(SETTINGS_KEY, merged);
  await notifyTelegramMailSync(allNewMails).catch((error) => {
    console.warn("[mail/sync] telegram notify failed:", error instanceof Error ? error.message : error);
  });

  return {
    synced: allNewMails.length,
    total: merged.length,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
}
