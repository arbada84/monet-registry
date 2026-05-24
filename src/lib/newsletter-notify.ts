/**
 * 기사 발행 시 뉴스레터 자동발송 — 공유 유틸리티
 * articles/route.ts 와 cron/publish/route.ts 양쪽에서 사용
 */
import type { Article } from "@/types/article";
import { serverGetSetting } from "@/lib/db-server";
import { createSmtpTransport, getSmtpRuntimeConfig } from "@/lib/smtp-settings";

interface NewsletterSubscriber {
  email: string;
  name: string;
  status: string;
  token?: string;
}

function normalizeSubscribers(value: NewsletterSubscriber[] | null | undefined): NewsletterSubscriber[] {
  return Array.isArray(value) ? value : [];
}

export async function notifyNewsletterOnPublish(article: Article): Promise<void> {
  try {
    const newsletterSettings = await getSmtpRuntimeConfig();
    if (!newsletterSettings.autoSendOnPublish) return;
    if (!newsletterSettings.status.configured) return;

    const { getBaseUrl } = await import("@/lib/get-base-url");
    const baseUrl = getBaseUrl();
    const articleUrl = `${baseUrl}/article/${article.no ?? article.id}`;

    const subscribers = normalizeSubscribers(await serverGetSetting<NewsletterSubscriber[] | null>(
      "cp-newsletter-subscribers", []
    ));
    const activeSubscribers = subscribers.filter((s) => s.status === "active");
    if (activeSubscribers.length === 0) return;

    const transporter = await createSmtpTransport(newsletterSettings);

    const subject = article.title;
    const bodyText = article.summary || article.title;

    const BATCH = 10;
    for (let i = 0; i < activeSubscribers.length; i += BATCH) {
      await Promise.allSettled(
        activeSubscribers.slice(i, i + BATCH).map((s) => {
          const unsubLink = s.token
            ? `${baseUrl}/api/newsletter/unsubscribe?token=${s.token}`
            : null;
          return transporter.sendMail({
            from: `"${newsletterSettings.senderName || "컬처피플"}" <${newsletterSettings.senderEmail}>`,
            replyTo: newsletterSettings.replyToEmail || newsletterSettings.senderEmail,
            to: `<${s.email}>`,
            subject,
            html: `<p>${bodyText}</p><p><a href="${articleUrl}">기사 보기</a></p>${
              unsubLink
                ? `<p style="font-size:12px;color:#999"><a href="${unsubLink}">구독 해제</a></p>`
                : ""
            }`,
          });
        })
      );
    }
  } catch (err) {
    console.error("[newsletter] 자동발송 실패:", err);
  }
}
