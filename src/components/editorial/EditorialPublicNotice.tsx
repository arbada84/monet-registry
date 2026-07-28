export interface EditorialPublicNoticeData {
  id: string;
  type: "correction" | "retraction";
  summary: string;
  approvedAt: string;
}

export function EditorialPublicNotice({ notices }: { notices: EditorialPublicNoticeData[] }) {
  if (!notices.length) return null;
  return (
    <aside className="mb-6 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" aria-label="기사 정정 및 철회 안내">
      <h2 className="font-bold">기사 {notices.some((notice) => notice.type === "retraction") ? "철회" : "정정"} 안내</h2>
      <ul className="mt-2 space-y-2">
        {notices.map((notice) => (
          <li key={notice.id}>
            <span className="font-semibold">{notice.type === "retraction" ? "철회" : "정정"}:</span>{" "}
            {notice.summary}
            {notice.approvedAt && <span className="ml-2 text-xs text-amber-800">({notice.approvedAt.slice(0, 10)})</span>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
