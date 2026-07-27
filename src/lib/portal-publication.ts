import "server-only";

import type { Article, DistributeLog } from "@/types/article";
import { serverAddDistributeLogs, serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { notifyIndexNow, type IndexNowAction, type IndexNowNotifyResult } from "@/lib/notify-search";

const STATE_KEY = "cp-portal-publication-state";
const DEBOUNCE_MS = 5 * 60 * 1000;
const MAX_RECENT_ENTRIES = 500;

export type PortalPublicationSource =
  | "manual"
  | "manual-edit"
  | "scheduled"
  | "auto-news"
  | "auto-press"
  | "auto-press-worker"
  | "mail"
  | "delete"
  | "manual-retry";

interface PortalPublicationState {
  recent?: Record<string, string>;
}

export interface PublishArticleToPortalsInput {
  articleId?: string | number;
  articleNo?: string | number | null;
  title?: string;
  status?: Article["status"];
  action?: IndexNowAction;
  source: PortalPublicationSource;
  force?: boolean;
}

export interface PublishArticleToPortalsResult {
  submitted: boolean;
  skipped: boolean;
  debounced: boolean;
  indexNow?: IndexNowNotifyResult;
}

function logId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `portal_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function articleIdentifier(input: PublishArticleToPortalsInput): string | null {
  const value = input.articleNo ?? input.articleId;
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function stateKey(identifier: string, action: IndexNowAction) {
  return `${action}:${identifier}`;
}

function trimRecent(recent: Record<string, string>, now: number): Record<string, string> {
  const entries = Object.entries(recent)
    .filter(([, value]) => {
      const ts = new Date(value).getTime();
      return Number.isFinite(ts) && now - ts < 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => new Date(b[1]).getTime() - new Date(a[1]).getTime())
    .slice(0, MAX_RECENT_ENTRIES);
  return Object.fromEntries(entries);
}

async function getDebounceState() {
  try {
    const state = await serverGetSetting<PortalPublicationState>(STATE_KEY, { recent: {} });
    return { recent: state.recent ?? {} };
  } catch {
    return { recent: {} };
  }
}

async function saveDebounceState(recent: Record<string, string>) {
  try {
    await serverSaveSetting(STATE_KEY, { recent });
  } catch {
    // Keep publishing best-effort even when state persistence is unavailable.
  }
}

async function addPortalLog(input: PublishArticleToPortalsInput, status: DistributeLog["status"], message: string) {
  const identifier = articleIdentifier(input) ?? "";
  const log: DistributeLog = {
    id: logId(),
    articleId: String(input.articleId ?? input.articleNo ?? identifier),
    articleTitle: input.title || "(제목 없음)",
    portal: "IndexNow",
    status,
    timestamp: new Date().toISOString(),
    message: `[${input.source}] ${message}`,
  };

  try {
    await serverAddDistributeLogs([log]);
  } catch {
    // Distribution logs should never block article publishing.
  }
}

export async function publishArticleToPortals(
  input: PublishArticleToPortalsInput,
): Promise<PublishArticleToPortalsResult> {
  const action = input.action ?? "URL_UPDATED";
  const identifier = articleIdentifier(input);

  if (!identifier) {
    await addPortalLog(input, "failed", "기사 번호 또는 ID가 없어 포털 게재 요청을 건너뛰었습니다.");
    return { submitted: false, skipped: true, debounced: false };
  }

  if (action === "URL_UPDATED" && input.status !== "게시") {
    return { submitted: false, skipped: true, debounced: false };
  }

  const now = Date.now();
  const key = stateKey(identifier, action);
  const state = await getDebounceState();
  const previous = state.recent[key] ? new Date(state.recent[key]).getTime() : 0;

  if (!input.force && previous && Number.isFinite(previous) && now - previous < DEBOUNCE_MS) {
    await addPortalLog(input, "pending", "최근 5분 이내 같은 URL 제출 기록이 있어 중복 요청을 생략했습니다.");
    return { submitted: false, skipped: true, debounced: true };
  }

  const recent = trimRecent({ ...state.recent, [key]: new Date(now).toISOString() }, now);
  await saveDebounceState(recent);

  const indexNow = await notifyIndexNow(identifier, action);
  if (indexNow.submitted) {
    await addPortalLog(input, "success", `IndexNow 제출 완료 (HTTP ${indexNow.status ?? "unknown"})`);
  } else if (indexNow.skipped) {
    await addPortalLog(input, "pending", indexNow.reason || "IndexNow API 키 미설정으로 제출을 건너뛰었습니다.");
  } else {
    await addPortalLog(input, "failed", indexNow.error || `IndexNow 제출 실패 (HTTP ${indexNow.status ?? "unknown"})`);
  }

  return {
    submitted: indexNow.submitted,
    skipped: indexNow.skipped,
    debounced: false,
    indexNow,
  };
}
