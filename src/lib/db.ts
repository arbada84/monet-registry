"use client";

/**
 * 클라이언트 DB 접근 레이어
 * 모든 데이터는 /api/db/* 라우트를 통해 MySQL에 저장됩니다.
 * Supabase / localStorage 의존성 제거
 */
import type { Article, ViewLogEntry, DistributeLog } from "@/types/article";

const BASE = "/api/db";

/** 401 감지 시 어드민 로그인 페이지로 리디렉션 (세션 만료 처리, 중복 방지) */
let _isRedirecting = false;
// 페이지 이동 완료 후 플래그 리셋 (popstate: 뒤로가기/앞으로가기 포함)
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", () => { _isRedirecting = false; });
}
async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options);
  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/admin") &&
    !_isRedirecting
  ) {
    _isRedirecting = true;
    window.location.href = "/admin/login?expired=1";
    throw new Error("세션이 만료되었습니다. 로그인 페이지로 이동합니다.");
  }
  return res;
}

// ─────────────────────────────────────────────
// Articles
// ─────────────────────────────────────────────

export async function getArticles(): Promise<Article[]> {
  const res = await apiFetch(`${BASE}/articles`, { cache: "no-store" });
  const data = await res.json();
  return data.articles ?? [];
}

export async function getArticleById(id: string): Promise<Article | null> {
  const res = await apiFetch(`${BASE}/articles?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  const data = await res.json();
  return data.article ?? null;
}

export async function createArticle(article: Article): Promise<void> {
  const res = await apiFetch(`${BASE}/articles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(article),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "기사 저장 실패");
  }
}

export async function updateArticle(id: string, updates: Partial<Article>): Promise<void> {
  const res = await apiFetch(`${BASE}/articles`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...updates }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "기사 수정 실패");
  }
}

export async function deleteArticle(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/articles?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "기사 삭제 실패");
  }
}

export async function incrementViews(id: string): Promise<void> {
  await fetch(`${BASE}/articles/views`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

// ─────────────────────────────────────────────
// View Logs
// ─────────────────────────────────────────────

export async function addViewLog(entry: { articleId: string; path: string }): Promise<void> {
  await fetch(`${BASE}/view-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
}

export async function getViewLogs(): Promise<ViewLogEntry[]> {
  const res = await apiFetch(`${BASE}/view-logs`, { cache: "no-store" });
  const data = await res.json();
  return data.logs ?? [];
}

// ─────────────────────────────────────────────
// Distribute Logs
// ─────────────────────────────────────────────

export async function getDistributeLogs(): Promise<DistributeLog[]> {
  const res = await apiFetch(`${BASE}/distribute-logs`, { cache: "no-store" });
  const data = await res.json();
  return data.logs ?? [];
}

export async function addDistributeLogs(logs: DistributeLog[]): Promise<void> {
  await apiFetch(`${BASE}/distribute-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logs }),
  });
}

export async function clearDistributeLogs(): Promise<void> {
  await apiFetch(`${BASE}/distribute-logs`, { method: "DELETE" });
}

// ─────────────────────────────────────────────
// Site Settings
// ─────────────────────────────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const params = new URLSearchParams({
      key,
      fallback: JSON.stringify(fallback),
    });
    const res = await apiFetch(`${BASE}/settings?${params}`, { cache: "no-store" });
    const data = await res.json();
    if (data.success) return data.value as T;
    return fallback;
  } catch {
    return fallback;
  }
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const res = await apiFetch(`${BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "설정 저장 실패");
  }
}
