"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import DOMPurify from "dompurify";

interface NetproItem {
  wr_id: string;
  title: string;
  category: string;
  writer: string;
  date: string;
  hits: string;
  detail_url: string;
}

interface NetproDetail {
  title: string;
  bodyText: string;
  bodyHtml: string;
  date: string;
  writer: string;
  images: string[];
  outboundLinks: string[];
  sourceUrl: string;
}

interface OriginDetail {
  url: string;
  title: string;
  date: string;
  thumbnail: string;
  bodyHtml: string;
  bodyText: string;
  images: string[];
}

const RSS_CATEGORIES: Record<string, string> = {
  "": "전체", policy: "정책뉴스", photo: "포토뉴스", media: "영상뉴스",
  fact: "사실은 이렇습니다", reporter: "국민이 말하는 정책", pressrelease: "브리핑룸",
  mofa: "외교부", unikorea: "통일부", moj: "법무부", nts: "국세청",
  customs: "관세청", pps: "조달청", kostat: "통계청", kcc: "방송통신위원회",
  nssc: "원자력안전위원회", president: "청와대", ebriefing: "e브리핑",
  cabinet: "국무회의", npa: "경찰청", moel: "고용노동부", ftc: "공정거래위원회",
  msit: "과학기술정보통신부", moe: "교육부", mpva: "국가보훈처", opm: "국무조정실",
  acrc: "국민권익위원회", mnd: "국방부", molit: "국토교통부", fsc: "금융위원회",
  kma: "기상청", mafra: "농림축산식품부", rda: "농촌진흥청", cha: "문화재청",
  mcst: "문화체육관광부", dapa: "방위사업청", moleg: "법제처", mma: "병무청",
  mw: "보건복지부", forest: "산림청", motie: "산업통상자원부", sda: "새만금개발청",
  nfa: "소방청", mfds: "식품의약품안전처", mogef: "여성가족부", mpm: "인사혁신처",
  mss: "중소벤처기업부", kipo: "특허청", kcg: "해양경찰청", mof: "해양수산부",
  mois: "행정안전부", macc: "행정중심복합도시건설청", mcee: "기후에너지환경부",
  chungnam: "충청남도", naju: "나주시", busan: "부산시청", gyeongnam: "경상남도",
  jeonnam: "전라남도", jeonbuk: "전라북도", yeonggwang: "영광군청", daegu: "대구시청",
};

const NEWSWIRE_CATEGORIES: Record<string, string> = {
  "": "전체", "100": "경제", "200": "금융", "300": "건설/부동산",
  "400": "산업", "500": "자동차", "600": "기술/IT", "700": "미디어",
  "800": "유통", "900": "라이프스타일", "1000": "건강", "1100": "교육",
  "1200": "문화/연예", "1300": "레저", "1400": "정책/정부",
  "1500": "에너지/환경", "1600": "스포츠", "1700": "농수산",
  "1800": "물류/교통", "1900": "사회",
};

const IMPORTED_KEY = "cp-press-imported";
const IMPORTED_MAX = 500;

function loadImportedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(IMPORTED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveImportedId(id: string): void {
  try {
    const set = loadImportedIds();
    set.add(id);
    // 최대 IMPORTED_MAX 개 유지 (오래된 것부터 제거)
    const arr = [...set];
    const trimmed = arr.length > IMPORTED_MAX ? arr.slice(arr.length - IMPORTED_MAX) : arr;
    localStorage.setItem(IMPORTED_KEY, JSON.stringify(trimmed));
  } catch { /* localStorage 쓰기 실패 무시 */ }
}

// 미리보기: 외부 이미지 src를 프록시 URL로 변환 (순수 함수 - 컴포넌트 외부)
function proxyImages(html: string): string {
  return html.replace(
    /src="(https?:\/\/[^"]+)"/gi,
    (_, url) => `src="/api/netpro/image?url=${encodeURIComponent(url)}"`
  );
}

// DOMPurify 옵션 (iframe 허용)
const PURIFY_OPTS = {
  ADD_TAGS: ["iframe"],
  ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "src", "width", "height"],
  FORCE_BODY: true,
};

export default function AdminPressImportPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"rss" | "newswire">("rss");
  const [items, setItems] = useState<NetproItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [sca, setSca] = useState("");
  const [searchText, setSearchText] = useState("");
  const [previewItem, setPreviewItem] = useState<NetproDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedWrId, setSelectedWrId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // 원문 탭 상태
  const [previewTab, setPreviewTab] = useState<"netpro" | "origin">("netpro");
  const [originDetail, setOriginDetail] = useState<OriginDetail | null>(null);
  const [originLoading, setOriginLoading] = useState(false);
  const [originError, setOriginError] = useState<string | null>(null);

  // 중복 방지: 이미 가져온 wr_id 목록
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  useEffect(() => { setImportedIds(loadImportedIds()); }, []);

  // 가져온 항목 제외 필터 (기본값: 제외)
  const [hideImported, setHideImported] = useState(true);

  // 체크박스 선택 상태
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; errors: number } | null>(null);
  const [bulkResultMsg, setBulkResultMsg] = useState<string | null>(null);

  // 임시 등록용 기본 카테고리 (settings에서 로드)
  const [draftCategories, setDraftCategories] = useState<string[]>(["뉴스", "연예", "스포츠", "문화", "라이프"]);
  const [draftCategory, setDraftCategory] = useState("뉴스");
  useEffect(() => {
    fetch("/api/db/settings?key=cp-categories")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.value) && d.value.length > 0) {
          const cats: string[] = d.value.map((c: { name?: string } | string) => (typeof c === "string" ? c : c.name || ""));
          setDraftCategories(cats.filter(Boolean));
          setDraftCategory(cats[0]);
        }
      })
      .catch(() => {});
  }, []);

  const importKey = (bo_table: string, wr_id: string) => `${bo_table}:${wr_id}`;
  const isImported = (item: NetproItem) => importedIds.has(importKey(activeTab, item.wr_id));

  // 표시할 항목 (필터 적용)
  const visibleItems = hideImported ? items.filter((item) => !isImported(item)) : items;

  // 체크박스 토글
  const toggleCheck = (wr_id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(wr_id)) { next.delete(wr_id); } else { next.add(wr_id); }
      return next;
    });
  };
  const toggleCheckAll = () => {
    if (checkedIds.size === visibleItems.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(visibleItems.map((i) => i.wr_id)));
    }
  };

  // 단일 임시저장 draft 생성 (페이지 이동 없음)
  const createDraftArticle = async (detail: NetproDetail, wrId: string): Promise<boolean> => {
    const body = await reuploadImages(detail.bodyHtml || detail.bodyText.split(/\n{2,}/).filter(p => p.trim()).map(p => `<p>${p.replace(/\n/g,"<br>")}</p>`).join(""));
    let thumbnail = "";
    // <img> 태그 src만 매칭 (iframe/video src 제외)
    const firstImg = body.match(/<img[^>]+src="(https?:\/\/[^"]+)"[^>]*>/i);
    if (firstImg?.[1]) {
      const imgSrc = firstImg[1];
      const isOwn = imgSrc.includes("supabase") || imgSrc.includes("culturepeople.co.kr");
      thumbnail = isOwn ? imgSrc : `/api/netpro/image?url=${encodeURIComponent(imgSrc)}`;
    }
    if (!thumbnail && detail.images?.[0]) {
      try {
        const r = await fetch("/api/upload/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: detail.images[0] }) });
        const d = await r.json();
        if (d.success && d.url) thumbnail = d.url;
        else thumbnail = `/api/netpro/image?url=${encodeURIComponent(detail.images[0])}`;
      } catch { thumbnail = `/api/netpro/image?url=${encodeURIComponent(detail.images[0])}`; }
    }
    const id = `press_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const resp = await fetch("/api/db/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id, title: detail.title || "제목 없음", category: draftCategory,
        date: new Date().toISOString(), status: "임시저장", views: 0,
        body, thumbnail,
        author: detail.writer || "", sourceUrl: detail.sourceUrl || "",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }),
    });
    const data = await resp.json();
    if (data.success) {
      const key = importKey(activeTab, wrId);
      saveImportedId(key);
      setImportedIds(prev => new Set([...prev, key]));
      return true;
    }
    return false;
  };

  // 미리보기 패널 단일 임시 등록
  const handleSingleDraft = async () => {
    if (!previewItem || !selectedWrId) return;
    setImporting(true);
    try {
      const ok = await createDraftArticle(previewItem, selectedWrId);
      const msg = ok ? "임시 등록 완료! 기사 목록에서 확인하세요." : "임시 등록에 실패했습니다.";
      setBulkResultMsg(msg);
      setTimeout(() => setBulkResultMsg(null), 5000);
    } catch {
      setBulkResultMsg("임시 등록 중 오류가 발생했습니다.");
      setTimeout(() => setBulkResultMsg(null), 5000);
    }
    setImporting(false);
  };

  // 체크된 항목 일괄 임시 등록
  const handleBulkDraft = async () => {
    if (checkedIds.size === 0 || bulkImporting) return;
    setBulkImporting(true);
    setBulkResultMsg(null);
    // visibleItems 기준으로 targets 구성 (숨겨진 항목 제외)
    const targets = visibleItems.filter((item) => checkedIds.has(item.wr_id));
    setBulkProgress({ done: 0, total: targets.length, errors: 0 });
    let errors = 0;
    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      try {
        const params = new URLSearchParams({ bo_table: activeTab, wr_id: item.wr_id });
        const resp = await fetch(`/api/netpro/detail?${params}`);
        const data = await resp.json();
        if (data.success) {
          const ok = await createDraftArticle(data as NetproDetail, item.wr_id);
          if (!ok) errors++;
        } else { errors++; }
      } catch { errors++; }
      setBulkProgress({ done: i + 1, total: targets.length, errors });
    }
    setCheckedIds(new Set());
    setBulkImporting(false);
    const msg = `임시 등록 완료: ${targets.length - errors}건 성공${errors > 0 ? `, ${errors}건 실패` : ""}`;
    setBulkResultMsg(msg);
    setTimeout(() => setBulkResultMsg(null), 5000);
    setBulkProgress(null);
  };

  const categories = activeTab === "rss" ? RSS_CATEGORIES : NEWSWIRE_CATEGORIES;

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        bo_table: activeTab,
        page: String(page),
        sca,
        stx: searchText,
      });
      const resp = await fetch(`/api/netpro/list?${params}`);
      const data = await resp.json();
      if (data.success) {
        setItems(data.items);
        setTotal(data.total);
        setLastPage(data.lastPage);
      } else {
        setError("목록을 불러오는데 실패했습니다.");
      }
    } catch {
      setError("서버에 연결할 수 없습니다. 네트워크를 확인해주세요.");
    }
    setLoading(false);
  }, [activeTab, page, sca, searchText]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleTabChange = (tab: "rss" | "newswire") => {
    setActiveTab(tab);
    setPage(1);
    setSca("");
    setSearchText("");
    setPreviewItem(null);
    setOriginDetail(null);
    setOriginError(null);
    setOriginLoading(false);
    setSelectedWrId(null);
    setPreviewTab("netpro");
    setCheckedIds(new Set());
    setBulkResultMsg(null);
  };

  const handlePreview = async (item: NetproItem) => {
    setSelectedWrId(item.wr_id);
    setPreviewLoading(true);
    setPreviewItem(null);
    setOriginDetail(null);
    setOriginLoading(false);
    setPreviewTab("netpro");
    setOriginError(null);
    try {
      const params = new URLSearchParams({ bo_table: activeTab, wr_id: item.wr_id });
      const resp = await fetch(`/api/netpro/detail?${params}`);
      const data = await resp.json();
      if (data.success) {
        setPreviewItem(data);
        setError(null);
      } else {
        setError("미리보기를 불러올 수 없습니다.");
      }
    } catch {
      setError("서버에 연결할 수 없습니다.");
    }
    setPreviewLoading(false);
  };

  const handleFetchOrigin = async () => {
    const originUrl = previewItem?.sourceUrl || previewItem?.outboundLinks?.[0];
    if (!previewItem || !originUrl) return;
    setOriginLoading(true);
    setOriginError(null);
    setOriginDetail(null);
    try {
      const resp = await fetch(`/api/netpro/origin?url=${encodeURIComponent(originUrl)}`);
      const data = await resp.json();
      if (data.success) {
        setOriginDetail(data);
      } else {
        setOriginError(data.error || "원문을 가져올 수 없습니다.");
      }
    } catch {
      setOriginError("원문 서버에 연결할 수 없습니다.");
    }
    setOriginLoading(false);
  };

  const handleOriginTabClick = () => {
    setPreviewTab("origin");
    if (!originDetail && !originLoading) {
      handleFetchOrigin();
    }
  };

  const handleImport = async (useOrigin = false) => {
    const source = useOrigin && originDetail ? originDetail : previewItem;
    if (!source) return;
    setImporting(true);

    let body = source.bodyHtml ||
      source.bodyText
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("");

    // 외부 이미지를 Supabase에 재업로드하여 편집기에서 정상 표시되도록 처리
    body = await reuploadImages(body);

    // 메인이미지(썸네일): <img> 태그 src만 매칭 (iframe/video src 제외)
    let thumbnail = "";
    const firstImgMatch = body.match(/<img[^>]+src="(https?:\/\/[^"]+)"[^>]*>/i);
    if (firstImgMatch?.[1]) {
      const imgSrc = firstImgMatch[1];
      const isOwn = imgSrc.includes("supabase") || imgSrc.includes("culturepeople.co.kr");
      thumbnail = isOwn ? imgSrc : `/api/netpro/image?url=${encodeURIComponent(imgSrc)}`;
    }
    // 본문에 이미지 없으면 원본 images[] 배열 첫 번째를 재업로드
    if (!thumbnail) {
      const origThumb = source.images?.[0] || "";
      if (origThumb) {
        try {
          const resp = await fetch("/api/upload/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: origThumb }),
          });
          const data = await resp.json();
          if (data.success && data.url) thumbnail = data.url;
          else thumbnail = `/api/netpro/image?url=${encodeURIComponent(origThumb)}`;
        } catch { thumbnail = `/api/netpro/image?url=${encodeURIComponent(origThumb)}`; }
      }
    }

    const importData = {
      title: source.title || previewItem?.title || "",
      body,
      thumbnail,
      author: previewItem?.writer || "",
      sourceUrl: useOrigin && originDetail ? originDetail.url : previewItem?.sourceUrl || "",
      date: source.date || previewItem?.date || "",
      images: source.images,
    };
    sessionStorage.setItem("cp-press-import", JSON.stringify(importData));

    // 가져온 항목 기록 (중복 방지)
    if (selectedWrId) {
      const key = importKey(activeTab, selectedWrId);
      saveImportedId(key);
      setImportedIds(prev => new Set([...prev, key]));
    }

    setImporting(false);
    router.push("/admin/articles/new?from=press");
  };

  // 가져오기: 외부 이미지를 Supabase에 재업로드 후 URL 교체 (최대 5개 동시)
  async function reuploadImages(html: string): Promise<string> {
    const urlSet = new Set<string>();
    const regex = /src="(https?:\/\/[^"]+)"/gi;
    let m;
    while ((m = regex.exec(html)) !== null) urlSet.add(m[1]);

    const urls = [...urlSet];
    const urlMap = new Map<string, string>();

    // 5개씩 병렬 처리 (무제한 동시 요청 방지)
    for (let i = 0; i < urls.length; i += 5) {
      const batch = urls.slice(i, i + 5);
      await Promise.all(batch.map(async (origUrl) => {
        if (origUrl.includes("supabase") || origUrl.includes("culturepeople.co.kr")) {
          urlMap.set(origUrl, origUrl);
          return;
        }
        try {
          const resp = await fetch("/api/upload/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: origUrl }),
          });
          const data = await resp.json();
          if (data.success && data.url) urlMap.set(origUrl, data.url);
        } catch { /* 실패 시 원본 URL 유지 */ }
      }));
    }

    return html.replace(/src="(https?:\/\/[^"]+)"/gi, (full, url) => {
      const replaced = urlMap.get(url);
      return replaced ? `src="${replaced}"` : full;
    });
  }

  // useMemo: bodyHtml 변경 시에만 sanitize 재실행 (렌더마다 실행 방지)
  const sanitizedNetproHtml = useMemo(() => {
    if (!previewItem?.bodyHtml) return "";
    return DOMPurify.sanitize(proxyImages(previewItem.bodyHtml), PURIFY_OPTS);
  }, [previewItem?.bodyHtml]);

  const sanitizedOriginHtml = useMemo(() => {
    if (!originDetail?.bodyHtml) return "";
    return DOMPurify.sanitize(proxyImages(originDetail.bodyHtml), PURIFY_OPTS);
  }, [originDetail?.bodyHtml]);

  const inputStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14, border: "1px solid #DDD", borderRadius: 8, outline: "none" };
  const hasCategory = (item: NetproItem) => item.category && item.category.trim() !== "";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>보도자료 수집</h1>
        <div style={{ fontSize: 13, color: "#666" }}>
          넷프로 보도자료 · 뉴스와이어에서 기사를 가져옵니다
        </div>
      </div>

      {/* 소스 탭 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[
          { key: "rss" as const, label: "보도자료 (정부/정책)", count: "205,000+" },
          { key: "newswire" as const, label: "뉴스와이어 (기업/산업)", count: "64,000+" },
        ].map((tab) => (
          <button key={tab.key} onClick={() => handleTabChange(tab.key)} style={{
            padding: "10px 20px", fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400,
            color: activeTab === tab.key ? "#E8192C" : "#666",
            background: activeTab === tab.key ? "#FFF0F0" : "#FFF",
            border: `1px solid ${activeTab === tab.key ? "#E8192C" : "#DDD"}`,
            borderRadius: 8, cursor: "pointer",
          }}>
            {tab.label} <span style={{ fontSize: 11, color: "#999" }}>({tab.count})</span>
          </button>
        ))}
      </div>

      {/* 필터 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={sca} onChange={(e) => { setSca(e.target.value); setPage(1); }} aria-label="카테고리 필터" style={{ ...inputStyle, minWidth: 160, background: "#FFF", cursor: "pointer" }}>
          {Object.entries(categories).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <div style={{ display: "flex" }}>
          <input
            type="text"
            placeholder="검색어"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            aria-label="보도자료 검색"
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); fetchList(); } }}
            style={{ ...inputStyle, borderRadius: "8px 0 0 8px", width: 200 }}
          />
          <button onClick={() => { setPage(1); fetchList(); }} style={{ padding: "8px 16px", background: "#E8192C", color: "#FFF", border: "none", borderRadius: "0 8px 8px 0", fontSize: 13, cursor: "pointer" }}>
            검색
          </button>
        </div>
        <button
          onClick={() => setHideImported(!hideImported)}
          style={{
            padding: "8px 14px", fontSize: 12, borderRadius: 8, cursor: "pointer",
            background: hideImported ? "#E8F5E9" : "#FFF",
            border: `1px solid ${hideImported ? "#66BB6A" : "#DDD"}`,
            color: hideImported ? "#2E7D32" : "#666",
            fontWeight: hideImported ? 600 : 400,
          }}
        >
          {hideImported ? "✓ 가져온 항목 제외 중" : "가져온 항목 포함"}
        </button>
        <span style={{ fontSize: 13, color: "#999" }}>
          총 {total.toLocaleString()}건 · {page}/{lastPage} 페이지
          {hideImported && visibleItems.length < items.length && (
            <span style={{ marginLeft: 6, color: "#E8192C" }}>
              (표시 {visibleItems.length}건, {items.length - visibleItems.length}건 숨김)
            </span>
          )}
        </span>

        {/* 일괄 임시 등록 영역 */}
        {checkedIds.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <span style={{ fontSize: 12, color: "#E8192C", fontWeight: 600 }}>{checkedIds.size}건 선택</span>
            <select
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value)}
              style={{ ...inputStyle, padding: "6px 10px", fontSize: 12 }}
            >
              {draftCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={handleBulkDraft}
              disabled={bulkImporting}
              style={{ padding: "7px 14px", background: bulkImporting ? "#CCC" : "#5C6BC0", color: "#FFF", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: bulkImporting ? "default" : "pointer", whiteSpace: "nowrap" }}
            >
              {bulkImporting && bulkProgress ? `임시 등록 중 ${bulkProgress.done}/${bulkProgress.total}` : "일괄 임시 등록"}
            </button>
            <button onClick={() => setCheckedIds(new Set())} style={{ padding: "6px 10px", background: "#FFF", border: "1px solid #DDD", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#666" }}>
              선택 해제
            </button>
          </div>
        )}

        {bulkResultMsg && (
          <div style={{ marginLeft: checkedIds.size > 0 ? 0 : "auto", padding: "6px 12px", background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: 6, fontSize: 12, color: "#2E7D32", cursor: "pointer" }} onClick={() => setBulkResultMsg(null)}>
            {bulkResultMsg} ✕
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: "12px 16px", marginBottom: 16, background: "#FFEBEE", border: "1px solid #FFCDD2", borderRadius: 8, color: "#C62828", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 16 }}>
        {/* 목록 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>불러오는 중...</div>
            ) : items.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>결과가 없습니다.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EEE" }}>
                    <th style={{ padding: "10px 12px", textAlign: "center", width: 36 }}>
                      <input type="checkbox"
                        checked={visibleItems.length > 0 && visibleItems.every(i => checkedIds.has(i.wr_id))}
                        onChange={toggleCheckAll}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666", width: 60 }}>번호</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#666", width: 90 }}>분류</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "#666" }}>제목</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#666", width: 100 }}>출처</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 500, color: "#666", width: 70 }}>날짜</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", fontWeight: 500, color: "#666", width: 80 }}>미리보기</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const already = isImported(item);
                    return (
                    <tr key={item.wr_id} style={{
                      borderBottom: "1px solid #EEE",
                      background: selectedWrId === item.wr_id ? "#FFF0F0" : already ? "#F9F9F9" : "transparent",
                      cursor: "pointer",
                      opacity: already ? 0.65 : 1,
                    }} onClick={() => handlePreview(item)}>
                      <td style={{ padding: "10px 12px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={checkedIds.has(item.wr_id)} onChange={() => {}} onClick={(e) => toggleCheck(item.wr_id, e)} style={{ cursor: "pointer" }} />
                      </td>
                      <td style={{ padding: "10px 16px", color: "#999" }}>{item.wr_id}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {hasCategory(item) && (
                          <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 11, background: "#F0F0F0", color: "#666", whiteSpace: "nowrap" }}>
                            {item.category}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 16px", fontWeight: 500, color: already ? "#999" : "#333" }}>
                        {already && <span style={{ fontSize: 10, background: "#E0E0E0", color: "#666", borderRadius: 3, padding: "1px 5px", marginRight: 5, verticalAlign: "middle" }}>가져옴</span>}
                        {item.title}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#666", fontSize: 12 }}>{item.writer}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center", color: "#999", fontSize: 12 }}>{item.date}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePreview(item); }}
                          style={{ padding: "4px 12px", background: "#FFF", border: "1px solid #DDD", borderRadius: 6, fontSize: 12, cursor: "pointer", color: "#333" }}
                        >
                          보기
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* 페이지네이션 */}
          <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 16 }}>
            <button disabled={page <= 1} onClick={() => setPage(1)} style={{ padding: "6px 12px", border: "1px solid #DDD", borderRadius: 6, background: "#FFF", cursor: page > 1 ? "pointer" : "default", color: page > 1 ? "#333" : "#CCC", fontSize: 12 }}>처음</button>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ padding: "6px 12px", border: "1px solid #DDD", borderRadius: 6, background: "#FFF", cursor: page > 1 ? "pointer" : "default", color: page > 1 ? "#333" : "#CCC", fontSize: 12 }}>이전</button>
            <span style={{ padding: "6px 16px", fontSize: 13, fontWeight: 600, color: "#E8192C" }}>{page}</span>
            <button disabled={page >= lastPage} onClick={() => setPage(page + 1)} style={{ padding: "6px 12px", border: "1px solid #DDD", borderRadius: 6, background: "#FFF", cursor: page < lastPage ? "pointer" : "default", color: page < lastPage ? "#333" : "#CCC", fontSize: 12 }}>다음</button>
            <button disabled={page >= lastPage} onClick={() => setPage(lastPage)} style={{ padding: "6px 12px", border: "1px solid #DDD", borderRadius: 6, background: "#FFF", cursor: page < lastPage ? "pointer" : "default", color: page < lastPage ? "#333" : "#CCC", fontSize: 12 }}>마지막</button>
          </div>
        </div>

        {/* 미리보기 패널 */}
        <div style={{ width: 440, flexShrink: 0 }}>
          <div style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 10, overflow: "hidden", position: "sticky", top: 80 }}>
            {previewLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 14 }}>로딩 중...</div>
            ) : previewItem ? (
              <>
                {/* 미리보기 탭 */}
                <div style={{ display: "flex", borderBottom: "1px solid #EEE", background: "#FAFAFA" }}>
                  <button onClick={() => setPreviewTab("netpro")} style={{
                    flex: 1, padding: "10px 0", fontSize: 13, fontWeight: previewTab === "netpro" ? 600 : 400,
                    color: previewTab === "netpro" ? "#E8192C" : "#666",
                    background: previewTab === "netpro" ? "#FFF" : "transparent",
                    border: "none", borderBottom: previewTab === "netpro" ? "2px solid #E8192C" : "2px solid transparent",
                    cursor: "pointer",
                  }}>
                    넷프로 본문
                  </button>
                  <button
                    onClick={handleOriginTabClick}
                    disabled={!previewItem.sourceUrl && previewItem.outboundLinks.length === 0}
                    style={{
                      flex: 1, padding: "10px 0", fontSize: 13, fontWeight: previewTab === "origin" ? 600 : 400,
                      color: previewTab === "origin" ? "#E8192C" : (!previewItem.sourceUrl && previewItem.outboundLinks.length === 0) ? "#CCC" : "#666",
                      background: previewTab === "origin" ? "#FFF" : "transparent",
                      border: "none", borderBottom: previewTab === "origin" ? "2px solid #E8192C" : "2px solid transparent",
                      cursor: (!previewItem.sourceUrl && previewItem.outboundLinks.length === 0) ? "default" : "pointer",
                    }}
                  >
                    원문 보기 {!previewItem.sourceUrl && previewItem.outboundLinks.length === 0 && <span style={{ fontSize: 11 }}>(링크 없음)</span>}
                  </button>
                </div>

                <div style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 10, lineHeight: 1.4 }}>
                    {previewTab === "origin" && originDetail ? originDetail.title || previewItem.title : previewItem.title}
                  </h3>
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#999", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #EEE" }}>
                    <span>{previewItem.writer}</span>
                    <span>{(previewTab === "origin" && originDetail?.date) ? originDetail.date : previewItem.date}</span>
                    {previewTab === "origin" && originDetail && (
                      <a href={originDetail.url} target="_blank" rel="noopener noreferrer" style={{ color: "#E8192C", textDecoration: "none", marginLeft: "auto" }}>
                        원문 링크
                      </a>
                    )}
                  </div>

                  {/* 탭 본문 */}
                  {previewTab === "netpro" ? (
                    <>
                      <div
                        className="press-preview-body"
                        style={{ fontSize: 13, color: "#444", lineHeight: 1.8, maxHeight: 420, overflowY: "auto", marginBottom: 12 }}
                        dangerouslySetInnerHTML={{ __html: sanitizedNetproHtml }}
                      />
                      {previewItem.sourceUrl && (
                        <div style={{ marginBottom: 12, padding: "8px 12px", background: "#F0F7FF", borderRadius: 6, borderLeft: "3px solid #1976D2" }}>
                          <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>원문 출처</div>
                          <a href={previewItem.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#1976D2", wordBreak: "break-all" }}>
                            {previewItem.sourceUrl}
                          </a>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {originLoading ? (
                        <div style={{ padding: 30, textAlign: "center", color: "#999", fontSize: 13 }}>원문 불러오는 중...</div>
                      ) : originError ? (
                        <div style={{ padding: "12px", background: "#FFEBEE", borderRadius: 6, color: "#C62828", fontSize: 13, marginBottom: 12 }}>
                          {originError}
                          <button onClick={handleFetchOrigin} style={{ marginLeft: 8, fontSize: 12, color: "#E8192C", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>재시도</button>
                        </div>
                      ) : originDetail ? (
                        <div
                          className="press-preview-body"
                          style={{ fontSize: 13, color: "#444", lineHeight: 1.8, maxHeight: 420, overflowY: "auto", marginBottom: 12 }}
                          dangerouslySetInnerHTML={{ __html: sanitizedOriginHtml }}
                        />
                      ) : null}
                    </>
                  )}

                  {/* 중복 경고 */}
                  {selectedWrId && importedIds.has(importKey(activeTab, selectedWrId)) && (
                    <div style={{ padding: "8px 12px", background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 6, fontSize: 12, color: "#795548", marginBottom: 8 }}>
                      ⚠ 이 보도자료는 이미 가져왔습니다.
                      <button
                        onClick={() => {
                          const key = importKey(activeTab, selectedWrId);
                          const newSet = new Set(importedIds);
                          newSet.delete(key);
                          setImportedIds(newSet);
                          try {
                            localStorage.setItem(IMPORTED_KEY, JSON.stringify([...newSet]));
                          } catch { /* ignore */ }
                        }}
                        style={{ marginLeft: 8, fontSize: 11, color: "#E8192C", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                      >
                        다시 가져오기
                      </button>
                    </div>
                  )}

                  {/* 가져오기 버튼 */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => handleImport(false)}
                      disabled={importing || (!!selectedWrId && importedIds.has(importKey(activeTab, selectedWrId)))}
                      style={{
                        flex: 1, padding: "10px 0",
                        background: importing ? "#CCC" : (selectedWrId && importedIds.has(importKey(activeTab, selectedWrId))) ? "#CCC" : "#E8192C",
                        color: "#FFF", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
                        cursor: (importing || (!!selectedWrId && importedIds.has(importKey(activeTab, selectedWrId)))) ? "default" : "pointer",
                      }}
                    >
                      {importing ? "이미지 업로드 중..." : "본문으로 가져오기"}
                    </button>
                    <button
                      onClick={handleSingleDraft}
                      disabled={importing || (!!selectedWrId && importedIds.has(importKey(activeTab, selectedWrId)))}
                      title="임시저장 상태로 기사 등록 (페이지 이동 없음)"
                      style={{
                        padding: "10px 12px", whiteSpace: "nowrap",
                        background: importing ? "#CCC" : (selectedWrId && importedIds.has(importKey(activeTab, selectedWrId))) ? "#CCC" : "#5C6BC0",
                        color: "#FFF", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600,
                        cursor: (importing || (!!selectedWrId && importedIds.has(importKey(activeTab, selectedWrId)))) ? "default" : "pointer",
                      }}
                    >
                      임시 등록
                    </button>
                    {originDetail && (
                      <button
                        onClick={() => handleImport(true)}
                        disabled={importing || (!!selectedWrId && importedIds.has(importKey(activeTab, selectedWrId)))}
                        style={{
                          flex: 1, padding: "10px 0",
                          background: importing ? "#CCC" : (selectedWrId && importedIds.has(importKey(activeTab, selectedWrId))) ? "#CCC" : "#1976D2",
                          color: "#FFF", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
                          cursor: (importing || (!!selectedWrId && importedIds.has(importKey(activeTab, selectedWrId)))) ? "default" : "pointer",
                        }}
                      >
                        원문으로 가져오기
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#999", marginTop: 8, textAlign: "center" }}>
                    AI 편집은 기사 작성 페이지에서 사용할 수 있습니다
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: 60, textAlign: "center", color: "#BBB", fontSize: 14 }}>
                왼쪽 목록에서 기사를 선택하면<br />미리보기가 표시됩니다
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
