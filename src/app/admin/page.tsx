"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/dashboard");
  }, [router]);

  return <div style={{ padding: 40, textAlign: "center", color: "#999" }}>대시보드로 이동 중...</div>;
}
