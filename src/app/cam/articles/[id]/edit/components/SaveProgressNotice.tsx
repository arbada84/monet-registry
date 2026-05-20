"use client";

interface SaveProgressNoticeProps {
  saving: boolean;
  saveProgress: string;
  saveElapsed: number;
}

export function SaveProgressNotice({ saving, saveProgress, saveElapsed }: SaveProgressNoticeProps) {
  if (!saveProgress) return null;

  return (
    <div style={{
      marginTop: 10, padding: "10px 16px", borderRadius: 8,
      display: "flex", alignItems: "center", gap: 10, fontSize: 13,
      background: saveProgress.startsWith("⛔") ? "#FFEBEE" : saveProgress.startsWith("⚠") ? "#FFF8E1" : saveProgress.startsWith("✔") ? "#E8F5E9" : "#F5F5F5",
      color: saveProgress.startsWith("⛔") ? "#C62828" : saveProgress.startsWith("⚠") ? "#E65100" : saveProgress.startsWith("✔") ? "#2E7D32" : "#555",
      border: saveProgress.startsWith("⛔") ? "1px solid #EF9A9A" : saveProgress.startsWith("⚠") ? "1px solid #FFE082" : saveProgress.startsWith("✔") ? "1px solid #A5D6A7" : "1px solid #E0E0E0",
    }}>
      {saving && !saveProgress.startsWith("✔") && !saveProgress.startsWith("⛔") && (
        <span style={{
          display: "inline-block", width: 16, height: 16,
          border: `2px solid ${saveProgress.startsWith("⚠") ? "#E65100" : "#E8192C"}`,
          borderTopColor: "transparent", borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
      )}
      <span style={{ flex: 1 }}>{saveProgress}</span>
      {saving && <span style={{ color: "#999", whiteSpace: "nowrap" }}>{saveElapsed}초 경과</span>}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
