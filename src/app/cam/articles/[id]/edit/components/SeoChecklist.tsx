"use client";

interface SeoChecklistProps {
  title: string;
  thumbnail: string;
  summary: string;
  tags: string;
  slug: string;
}

export function SeoChecklist({ title, thumbnail, summary, tags, slug }: SeoChecklistProps) {
  const seoChecks = [
    { label: "제목 20자 이상", ok: title.trim().length >= 20 },
    { label: "썸네일 설정", ok: !!thumbnail },
    { label: "요약문 작성", ok: !!summary.trim() },
    { label: "태그 입력", ok: !!tags.trim() },
    { label: "slug 설정", ok: !!slug.trim() },
  ];
  const passedCount = seoChecks.filter((c) => c.ok).length;
  const passedAll = passedCount === seoChecks.length;

  return (
    <div style={{
      padding: "12px 16px",
      background: passedAll ? "#F1F8E9" : "#FFFDE7",
      border: `1px solid ${passedAll ? "#AED581" : "#FFE082"}`,
      borderRadius: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: passedAll ? 0 : 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: passedAll ? "#558B2F" : "#F57F17" }}>
          {passedAll ? "SEO 완료" : `SEO ${passedCount}/${seoChecks.length}`}
        </span>
        {!passedAll && <span style={{ fontSize: 12, color: "#888" }}>— 미완료 항목이 있습니다 (발행은 가능합니다)</span>}
      </div>
      {!passedAll && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
          {seoChecks.map((c) => (
            <span key={c.label} style={{ fontSize: 12, color: c.ok ? "#558B2F" : "#F57F17", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10 }}>{c.ok ? "✓" : "!"}</span>
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
