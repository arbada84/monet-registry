"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Article } from "@/types/article";
import { CATEGORIES as DEFAULT_CATEGORIES } from "@/lib/constants";
import { getArticles, deleteArticle, updateArticle, createArticle, getSetting, getDeletedArticles, restoreArticle, purgeArticle } from "@/lib/db";
import { logActivity } from "@/lib/log-activity";

const DEFAULT_itemsPerPage = 15;
const PAGE_SIZE_OPTIONS = [15, 30, 50, 100];

type SortKey = "date" | "views" | "title";
type SortDir = "asc" | "desc";

function AdminArticlesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_itemsPerPage);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  // Search & Filter — URL 파라미터와 동기화
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [filterCategory, setFilterCategory] = useState(() => searchParams.get("cat") ?? "전체");
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get("status") ?? "전체");
  const [sortKey, setSortKey] = useState<SortKey>(() => (searchParams.get("sort") as SortKey) ?? "date");
  const [sortDir, setSortDir] = useState<SortDir>(() => (searchParams.get("dir") as SortDir) ?? "desc");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [trashMode, setTrashMode] = useState(false);
  // 상신 승인/반려
  const [reviewTarget, setReviewTarget] = useState<Article | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [trashArticles, setTrashArticles] = useState<Article[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      getArticles(),
      getSetting<{ name: string }[] | null>("cp-categories", null),
      fetch("/api/auth/me", { credentials: "include" }).then((r) => r.json()),
    ]).then(([artsR, catsR, meR]) => {
      if (artsR.status === "fulfilled") setArticles(artsR.value);
      if (catsR.status === "fulfilled" && catsR.value && catsR.value.length > 0) {
        setCategories(catsR.value.map((c) => c.name));
      }
      if (meR.status === "fulfilled" && meR.value?.role) setCurrentRole(meR.value.role);
      setLoading(false);
    });
  }, []);

  const loadTrash = () => {
    setTrashLoading(true);
    getDeletedArticles().then((data) => { setTrashArticles(data); setTrashLoading(false); });
  };

  const handleRestore = async (id: string) => {
    await restoreArticle(id);
    setTrashArticles((prev) => prev.filter((a) => a.id !== id));
    // 복원된 기사를 메인 목록에 추가하기 위해 다시 로드
    getArticles().then((data) => setArticles(data));
  };

  const handlePurge = async (id: string) => {
    await purgeArticle(id);
    setTrashArticles((prev) => prev.filter((a) => a.id !== id));
  };

  // URL 파라미터 동기화 + currentPage 리셋 통합
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filterCategory !== "전체") params.set("cat", filterCategory);
    if (filterStatus !== "전체") params.set("status", filterStatus);
    if (sortKey !== "date") params.set("sort", sortKey);
    if (sortDir !== "desc") params.set("dir", sortDir);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
    setCurrentPage(1);
  }, [search, filterCategory, filterStatus, sortKey, sortDir, router]);

  // Filtered & sorted articles
  const filtered = useMemo(() => {
    let result = [...articles];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.author?.toLowerCase().includes(q) ||
          a.tags?.toLowerCase().includes(q) ||
          a.category?.toLowerCase().includes(q) ||
          a.summary?.toLowerCase().includes(q)
      );
    }
    if (filterCategory !== "전체") result = result.filter((a) => a.category === filterCategory);
    if (filterStatus !== "전체") result = result.filter((a) => a.status === filterStatus);
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "views") cmp = (a.views || 0) - (b.views || 0);
      else if (sortKey === "title") cmp = a.title.localeCompare(b.title);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return result;
  }, [articles, search, filterCategory, filterStatus, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleDelete = async (id: string) => {
    try {
      const article = articles.find((a) => a.id === id);
      await deleteArticle(id);
      setArticles((prev) => prev.filter((a) => a.id !== id));
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      if (article) logActivity({ action: "기사 삭제", target: article.title, targetId: id });
    } catch {
      alert("삭제에 실패했습니다. 다시 시도해주세요.");
    }
    setConfirmDeleteId(null);
  };

  const handleDuplicate = async (article: Article) => {
    setDuplicating(article.id);
    const copy: Article = {
      ...article,
      id: crypto.randomUUID(),
      no: undefined,   // 복제본은 새 번호 자동 부여
      title: `${article.title} (복사본)`,
      status: "임시저장",
      date: new Date().toISOString().slice(0, 10),
      views: 0,
      slug: undefined,
      scheduledPublishAt: undefined,
      updatedAt: undefined,
    };
    try {
      await createArticle(copy);
      setArticles((prev) => [copy, ...prev]);
      setDuplicateError(null);
    } catch (e) {
      setDuplicateError(e instanceof Error ? e.message : "복제에 실패했습니다.");
      setTimeout(() => setDuplicateError(null), 4000);
    }
    setDuplicating(null);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map((a) => a.id)));
    }
  };

  const handleBulkAction = async () => {
    if (selected.size === 0 || !bulkAction) return;
    if (bulkAction === "delete") {
      setConfirmBulkDelete(true);
      return;
    }
    const ids = Array.from(selected);
    const results = await Promise.allSettled(
      ids.map((id) => {
        if (bulkAction === "category" && bulkCategory) return updateArticle(id, { category: bulkCategory });
        if (bulkAction === "게시" || bulkAction === "임시저장") return updateArticle(id, { status: bulkAction });
        return Promise.resolve();
      })
    );
    const successIds = new Set(ids.filter((_, i) => results[i].status === "fulfilled"));
    const failCount = ids.length - successIds.size;
    if (bulkAction === "category" && bulkCategory) {
      setArticles((prev) => prev.map((a) => successIds.has(a.id) ? { ...a, category: bulkCategory } : a));
    } else if (bulkAction === "게시" || bulkAction === "임시저장") {
      setArticles((prev) => prev.map((a) => successIds.has(a.id) ? { ...a, status: bulkAction } : a));
    }
    if (failCount > 0) alert(`${failCount}건 처리에 실패했습니다.`);
    setSelected(new Set());
    setBulkAction("");
    setBulkCategory("");
  };

  const executeBulkDelete = async () => {
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map((id) => deleteArticle(id)));
    const successIds = new Set(ids.filter((_, i) => results[i].status === "fulfilled"));
    const failCount = ids.length - successIds.size;
    setArticles((prev) => prev.filter((a) => !successIds.has(a.id)));
    if (failCount > 0) alert(`${failCount}건 삭제에 실패했습니다.`);
    setSelected(new Set());
    setBulkAction("");
    setConfirmBulkDelete(false);
    setCurrentPage(1);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  // 상신 기사 승인
  const handleApprove = async (article: Article) => {
    try {
      const currentUser = localStorage.getItem("cp-admin-user") || "관리자";
      const trail = [...(article.auditTrail || []), {
        action: "승인" as const, by: currentUser, at: new Date().toISOString(),
      }];
      await updateArticle(article.id, { status: "게시", auditTrail: trail, reviewNote: undefined });
      setArticles((prev) => prev.map((a) => a.id === article.id ? { ...a, status: "게시" as const, auditTrail: trail } : a));
      logActivity({ action: "기사 승인", target: article.title, targetId: article.id });
    } catch {
      alert("승인에 실패했습니다.");
    }
  };

  // 상신 기사 반려
  const handleReject = async () => {
    if (!reviewTarget) return;
    try {
      const currentUser = localStorage.getItem("cp-admin-user") || "관리자";
      const trail = [...(reviewTarget.auditTrail || []), {
        action: "반려" as const, by: currentUser, at: new Date().toISOString(), note: rejectNote || undefined,
      }];
      await updateArticle(reviewTarget.id, { status: "임시저장", auditTrail: trail, reviewNote: rejectNote || undefined });
      setArticles((prev) => prev.map((a) => a.id === reviewTarget.id ? { ...a, status: "임시저장" as const, auditTrail: trail, reviewNote: rejectNote } : a));
      logActivity({ action: "기사 반려", target: reviewTarget.title, targetId: reviewTarget.id, detail: rejectNote || undefined });
    } catch {
      alert("반려에 실패했습니다.");
    }
    setReviewTarget(null);
    setRejectNote("");
  };

  const getPageNumbers = () => {
    const pages: number[] = [];
    let start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>기사 관리 </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setTrashMode(!trashMode); if (!trashMode) loadTrash(); }} style={{
            padding: "10px 16px", background: trashMode ? "#E8192C" : "#F5F5F5", color: trashMode ? "#FFF" : "#666",
            border: trashMode ? "none" : "1px solid #DDD", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>
            휴지통{trashMode ? "" : ` (${trashArticles.length || ""})`}
          </button>
          {!trashMode && (
            <>
              <Link href="/cam/articles/upload-md" style={{ padding: "10px 16px", background: "#607D8B", color: "#FFF", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                MD 업로드
              </Link>
              <Link href="/cam/articles/new" style={{ padding: "10px 20px", background: "#E8192C", color: "#FFF", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                + 기사 작성
              </Link>
            </>
          )}
        </div>
      </div>

      {duplicateError && (
        <div style={{ padding: "10px 16px", background: "#FFF0F0", border: "1px solid #FFCDD2", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#C62828" }}>
          복제 실패: {duplicateError}
        </div>
      )}

      {/* 휴지통 모드 */}
      {trashMode && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: "#666" }}>
              휴지통에 {trashArticles.length}건의 기사가 있습니다. 설정된 보관 기간이 지나면 자동으로 영구 삭제됩니다.
            </span>
          </div>
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
            {trashLoading ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>불러오는 중...</div>
            ) : trashArticles.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>휴지통이 비어 있습니다.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                    <th style={{ padding: "10px 20px", textAlign: "left", fontWeight: 500, color: "#666" }}>제목</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666", width: 100 }}>카테고리</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666", width: 110 }}>삭제일</th>
                    <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666", width: 160 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {trashArticles.map((article) => (
                    <tr key={article.id} style={{ borderBottom: "1px solid #EEE" }}>
                      <td style={{ padding: "12px 20px", color: "#666" }}>{article.title}</td>
                      <td style={{ padding: "12px 16px", color: "#999" }}>{article.category}</td>
                      <td style={{ padding: "12px 16px", color: "#999", fontSize: 12 }}>{article.deletedAt?.slice(0, 10) ?? "-"}</td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          <button onClick={() => handleRestore(article.id)} style={{
                            padding: "4px 12px", background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: 6, color: "#2E7D32", fontSize: 12, cursor: "pointer",
                          }}>복원</button>
                          <button onClick={() => handlePurge(article.id)} style={{
                            padding: "4px 12px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer",
                          }}>영구삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {!trashMode && (<>
      {/* Search & Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="제목, 작성자, 태그 검색..."
          aria-label="기사 검색"
          style={{ flex: 1, minWidth: 200, padding: "8px 12px", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, outline: "none" }}
        />
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} aria-label="카테고리 필터" style={{ padding: "8px 12px", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, background: "#FFF", cursor: "pointer" }}>
          <option value="전체">전체 카테고리</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="상태 필터" style={{ padding: "8px 12px", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, background: "#FFF", cursor: "pointer" }}>
          <option value="전체">전체 상태</option>
          <option value="게시">게시</option>
          <option value="임시저장">임시저장</option>
          <option value="상신">상신</option>
          <option value="예약">예약</option>
        </select>
        <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} aria-label="페이지당 기사 수" style={{ padding: "8px 12px", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, background: "#FFF", cursor: "pointer" }}>
          {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}개씩</option>)}
        </select>
        <span style={{ fontSize: 12, color: "#999" }}>
          {(search || filterCategory !== "전체" || filterStatus !== "전체")
            ? `전체 ${articles.length}건 중 ${filtered.length}건`
            : `전체 ${articles.length}건`}
          {filtered.length > itemsPerPage && ` · ${currentPage}/${totalPages} 페이지`}
        </span>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, padding: "8px 16px", background: "#FFF0F0", borderRadius: 8, fontSize: 13, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, color: "#E8192C" }}>{selected.size}개 선택</span>
          {confirmBulkDelete ? (
            <>
              <span style={{ color: "#E8192C" }}>{selected.size}개 기사를 삭제할까요?</span>
              <button onClick={executeBulkDelete} style={{ padding: "4px 12px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>삭제</button>
              <button onClick={() => setConfirmBulkDelete(false)} style={{ padding: "4px 12px", background: "#FFF", color: "#666", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>취소</button>
            </>
          ) : (
            <>
              <select value={bulkAction} onChange={(e) => { setBulkAction(e.target.value); setBulkCategory(""); }} aria-label="일괄 작업" style={{ padding: "4px 8px", border: "1px solid #DDD", borderRadius: 6, fontSize: 12 }}>
                <option value="">일괄 작업 선택</option>
                <option value="게시">게시로 변경</option>
                <option value="임시저장">임시저장으로 변경</option>
                <option value="category">카테고리 변경</option>
                <option value="delete">삭제</option>
              </select>
              {bulkAction === "category" && (
                <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} aria-label="변경할 카테고리" style={{ padding: "4px 8px", border: "1px solid #DDD", borderRadius: 6, fontSize: 12 }}>
                  <option value="">카테고리 선택</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <button onClick={handleBulkAction} disabled={!bulkAction || (bulkAction === "category" && !bulkCategory)} style={{ padding: "4px 12px", background: (bulkAction && !(bulkAction === "category" && !bulkCategory)) ? "#E8192C" : "#CCC", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, cursor: (bulkAction && !(bulkAction === "category" && !bulkCategory)) ? "pointer" : "default" }}>
                실행
              </button>
              <button onClick={() => setSelected(new Set())} style={{ padding: "4px 12px", background: "#FFF", color: "#666", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                선택 해제
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>
            {search || filterCategory !== "전체" || filterStatus !== "전체" ? "검색 결과가 없습니다." : "등록된 기사가 없습니다."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                <th style={{ padding: "10px 12px", width: 40 }}>
                  <input type="checkbox" checked={paginated.length > 0 && selected.size === paginated.length} onChange={toggleSelectAll} />
                </th>
                <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 500, color: "#666", width: 50 }}>번호</th>
                <th onClick={() => handleSort("title")} style={{ padding: "10px 20px", textAlign: "left", fontWeight: 500, color: "#666", cursor: "pointer" }}>
                  제목{sortIcon("title")}
                </th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666", width: 100 }}>카테고리</th>
                <th onClick={() => handleSort("date")} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666", width: 110, cursor: "pointer" }}>
                  날짜{sortIcon("date")}
                </th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666", width: 80 }}>상태</th>
                <th onClick={() => handleSort("views")} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666", width: 80, cursor: "pointer" }}>
                  조회수{sortIcon("views")}
                </th>
                <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666", width: 160 }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>불러오는 중...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>기사가 없습니다.</td></tr>
              ) : null}
              {!loading && paginated.map((article) => (
                <tr key={article.id} style={{ borderBottom: "1px solid #EEE", background: selected.has(article.id) ? "#FFF8F8" : "transparent" }}>
                  <td style={{ padding: "12px 12px", textAlign: "center" }}>
                    <input type="checkbox" checked={selected.has(article.id)} onChange={() => toggleSelect(article.id)} />
                  </td>
                  <td style={{ padding: "12px 8px", textAlign: "center", color: "#999", fontSize: 12 }}>
                    {article.no ?? "-"}
                  </td>
                  <td style={{ padding: "12px 20px" }}>
                    <Link href={`/cam/articles/${article.id}/edit`} style={{ color: "#111", textDecoration: "none" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#E8192C")} onMouseLeave={(e) => (e.currentTarget.style.color = "#111")}>
                      {article.title}
                    </Link>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#666" }}>{article.category}</td>
                  <td style={{ padding: "12px 16px", color: "#666" }}>{article.date}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 500,
                      background: article.status === "게시" ? "#E8F5E9" : article.status === "상신" ? "#E3F2FD" : article.status === "예약" ? "#F3E5F5" : "#FFF3E0",
                      color: article.status === "게시" ? "#2E7D32" : article.status === "상신" ? "#1565C0" : article.status === "예약" ? "#7B1FA2" : "#E65100"
                    }}>
                      {article.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#666" }}>{(article.views || 0).toLocaleString()}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                      {article.status === "게시" && (
                        <a
                          href={`/article/${article.no ?? article.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ padding: "4px 10px", background: "#F0F0F0", border: "1px solid #CCC", borderRadius: 6, color: "#555", fontSize: 12, textDecoration: "none" }}
                        >
                          보기
                        </a>
                      )}
                      {article.sourceUrl && (
                        <a
                          href={article.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="보도자료 원문 보기"
                          style={{ padding: "4px 10px", background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 6, color: "#F57F17", fontSize: 12, textDecoration: "none" }}
                        >
                          원문
                        </a>
                      )}
                      {article.status === "상신" && currentRole !== "reporter" && (
                        <>
                          <button
                            onClick={() => handleApprove(article)}
                            style={{ padding: "4px 10px", background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: 6, color: "#2E7D32", fontSize: 12, cursor: "pointer" }}
                          >
                            승인
                          </button>
                          <button
                            onClick={() => { setReviewTarget(article); setRejectNote(""); }}
                            style={{ padding: "4px 10px", background: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: 6, color: "#C62828", fontSize: 12, cursor: "pointer" }}
                          >
                            반려
                          </button>
                        </>
                      )}
                      <Link href={`/cam/articles/${article.id}/edit`} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #888", borderRadius: 6, color: "#555", fontSize: 12, textDecoration: "none" }}>
                        편집
                      </Link>
                      <button
                        onClick={() => handleDuplicate(article)}
                        disabled={duplicating === article.id}
                        title="복제 (임시저장으로 복사)"
                        style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #888", borderRadius: 6, color: "#555", fontSize: 12, cursor: duplicating === article.id ? "default" : "pointer", opacity: duplicating === article.id ? 0.5 : 1 }}
                      >
                        {duplicating === article.id ? "..." : "복제"}
                      </button>
                      {confirmDeleteId === article.id ? (
                        <>
                          <button onClick={() => handleDelete(article.id)} style={{ padding: "4px 12px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>삭제</button>
                          <button onClick={() => setConfirmDeleteId(null)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>취소</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(article.id)} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #E8192C", borderRadius: 6, color: "#E8192C", fontSize: 12, cursor: "pointer" }}>
                          삭제
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {filtered.length > itemsPerPage && (
        <div className="flex flex-wrap justify-center items-center gap-1 mt-6">
          <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className={`px-3 py-2 border rounded text-sm ${currentPage === 1 ? "border-gray-200 text-gray-300 cursor-default" : "border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer"}`}>
            &lt;
          </button>
          {getPageNumbers().map((page) => (
            <button key={page} onClick={() => setCurrentPage(page)} className={`px-3 py-2 border rounded text-sm font-medium cursor-pointer ${page === currentPage ? "text-white border-[#E8192C]" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`} style={page === currentPage ? { backgroundColor: "#E8192C" } : {}}>
              {page}
            </button>
          ))}
          <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className={`px-3 py-2 border rounded text-sm ${currentPage === totalPages ? "border-gray-200 text-gray-300 cursor-default" : "border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer"}`}>
            &gt;
          </button>
        </div>
      )}
      </>)}

      {/* 반려 사유 입력 모달 */}
      {reviewTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => { setReviewTarget(null); setRejectNote(""); }}
        >
          <div style={{ background: "#FFF", borderRadius: 12, padding: 24, width: 420, maxWidth: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>기사 반려</h3>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              <strong>{reviewTarget.title}</strong>
            </div>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="반려 사유를 입력하세요 (기자에게 전달됩니다)"
              rows={3}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, resize: "vertical", outline: "none", lineHeight: 1.6, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => { setReviewTarget(null); setRejectNote(""); }} style={{ padding: "8px 20px", background: "#F5F5F5", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                취소
              </button>
              <button onClick={handleReject} style={{ padding: "8px 20px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                반려
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminArticlesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#999" }}>불러오는 중...</div>}>
      <AdminArticlesPageInner />
    </Suspense>
  );
}
