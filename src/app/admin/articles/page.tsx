"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Article } from "@/types/article";
import { CATEGORIES } from "@/lib/constants";
import { getArticles, deleteArticle, updateArticle, createArticle } from "@/lib/db";

const ITEMS_PER_PAGE = 15;

type SortKey = "date" | "views" | "title";
type SortDir = "asc" | "desc";

function AdminArticlesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Search & Filter — URL 파라미터와 동기화
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [filterCategory, setFilterCategory] = useState(() => searchParams.get("cat") ?? "전체");
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get("status") ?? "전체");
  const [sortKey, setSortKey] = useState<SortKey>(() => (searchParams.get("sort") as SortKey) ?? "date");
  const [sortDir, setSortDir] = useState<SortDir>(() => (searchParams.get("dir") as SortDir) ?? "desc");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  useEffect(() => {
    getArticles().then((data) => { setArticles(data); setLoading(false); });
  }, []);

  // URL 파라미터 동기화
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (filterCategory !== "전체") params.set("cat", filterCategory);
    if (filterStatus !== "전체") params.set("status", filterStatus);
    if (sortKey !== "date") params.set("sort", sortKey);
    if (sortDir !== "desc") params.set("dir", sortDir);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [search, filterCategory, filterStatus, sortKey, sortDir, router]);

  // Filtered & sorted articles
  const filtered = useMemo(() => {
    let result = [...articles];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (a) => a.title.toLowerCase().includes(q) || a.author?.toLowerCase().includes(q) || a.tags?.toLowerCase().includes(q)
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterCategory, filterStatus, sortKey, sortDir]);

  const handleDelete = async (id: string) => {
    await deleteArticle(id);
    setArticles((prev) => prev.filter((a) => a.id !== id));
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setConfirmDeleteId(null);
  };

  const handleDuplicate = async (article: Article) => {
    setDuplicating(article.id);
    const copy: Article = {
      ...article,
      id: crypto.randomUUID(),
      title: `${article.title} (복사본)`,
      status: "임시저장",
      date: new Date().toISOString().slice(0, 10),
      views: 0,
      slug: undefined,
    };
    try {
      await createArticle(copy);
      setArticles((prev) => [copy, ...prev]);
    } catch { /* ignore */ }
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
    if (bulkAction === "게시" || bulkAction === "임시저장") {
      for (const id of selected) await updateArticle(id, { status: bulkAction });
      setArticles((prev) => prev.map((a) => selected.has(a.id) ? { ...a, status: bulkAction } : a));
    }
    setSelected(new Set());
    setBulkAction("");
  };

  const executeBulkDelete = async () => {
    for (const id of selected) await deleteArticle(id);
    setArticles((prev) => prev.filter((a) => !selected.has(a.id)));
    setSelected(new Set());
    setBulkAction("");
    setConfirmBulkDelete(false);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";

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
        <Link href="/admin/articles/new" style={{ padding: "10px 20px", background: "#E8192C", color: "#FFF", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
          + 기사 작성
        </Link>
      </div>

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
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="상태 필터" style={{ padding: "8px 12px", border: "1px solid #DDD", borderRadius: 8, fontSize: 13, background: "#FFF", cursor: "pointer" }}>
          <option value="전체">전체 상태</option>
          <option value="게시">게시</option>
          <option value="임시저장">임시저장</option>
        </select>
        <span style={{ fontSize: 12, color: "#999" }}>{filtered.length}건</span>
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
              <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)} aria-label="일괄 작업" style={{ padding: "4px 8px", border: "1px solid #DDD", borderRadius: 6, fontSize: 12 }}>
                <option value="">일괄 작업 선택</option>
                <option value="게시">게시로 변경</option>
                <option value="임시저장">임시저장으로 변경</option>
                <option value="delete">삭제</option>
              </select>
              <button onClick={handleBulkAction} disabled={!bulkAction} style={{ padding: "4px 12px", background: bulkAction ? "#E8192C" : "#CCC", color: "#FFF", border: "none", borderRadius: 6, fontSize: 12, cursor: bulkAction ? "pointer" : "default" }}>
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
                <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#666", width: 130 }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>불러오는 중...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>기사가 없습니다.</td></tr>
              ) : null}
              {!loading && paginated.map((article) => (
                <tr key={article.id} style={{ borderBottom: "1px solid #EEE", background: selected.has(article.id) ? "#FFF8F8" : "transparent" }}>
                  <td style={{ padding: "12px 12px", textAlign: "center" }}>
                    <input type="checkbox" checked={selected.has(article.id)} onChange={() => toggleSelect(article.id)} />
                  </td>
                  <td style={{ padding: "12px 20px", color: "#111" }}>{article.title}</td>
                  <td style={{ padding: "12px 16px", color: "#666" }}>{article.category}</td>
                  <td style={{ padding: "12px 16px", color: "#666" }}>{article.date}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 500, background: article.status === "게시" ? "#E8F5E9" : "#FFF3E0", color: article.status === "게시" ? "#2E7D32" : "#E65100" }}>
                      {article.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#666" }}>{(article.views || 0).toLocaleString()}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                      <Link href={`/admin/articles/${article.id}/edit`} style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #888", borderRadius: 6, color: "#555", fontSize: 12, textDecoration: "none" }}>
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
      {filtered.length > ITEMS_PER_PAGE && (
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
