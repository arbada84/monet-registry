import { describe, expect, it } from "vitest";
import {
  localizeNotificationText,
  localizeOperationalMessage,
} from "@/lib/korean-operational-messages";

describe("korean operational messages", () => {
  it("localizes legacy English media storage notifications", () => {
    expect(localizeOperationalMessage("Media storage check failed before auto-press run"))
      .toBe("보도자료 자동등록 실행 전 미디어 저장소 점검 실패");
    expect(localizeOperationalMessage("Media storage is not healthy."))
      .toBe("미디어 저장소 상태가 정상적이지 않습니다.");
  });

  it("turns Supabase quota messages into actionable Korean guidance", () => {
    const localized = localizeOperationalMessage(
      "Supabase Storage bucket 'images' returned HTTP 402: Service for this project is restricted due to the following violations: exceed_storage_size_quota.",
    );

    expect(localized).toContain("저장공간 한도 초과");
    expect(localized).toContain("Cloudflare R2");
    expect(localized).not.toContain("exceed_storage_size_quota");
  });

  it("hides legacy raw cron error details from notification text", () => {
    expect(localizeOperationalMessage("[auto-news] 실행 실패: fetch failed"))
      .toBe("자동 뉴스 실행 실패. 세부 오류는 관리자 로그를 확인하세요.");
    expect(localizeOperationalMessage("[auto-press] 실행 실패: Supabase create notification error 402"))
      .toBe("보도자료 자동등록 실행 실패. 세부 오류는 관리자 로그를 확인하세요.");
    expect(localizeOperationalMessage("AI 편집 실패: 테스트 기사 — Gemini quota exceeded"))
      .toBe("AI 편집 실패: 테스트 기사");
  });

  it("localizes notification records without changing other fields", () => {
    const notification = localizeNotificationText({
      id: "n1",
      type: "media_storage",
      title: "Media storage check failed before auto-news run",
      message: "Media storage is not healthy.",
      metadata: { route: "auto-news" },
      read: false,
      created_at: "2026-05-01T00:00:00.000Z",
    });

    expect(notification).toMatchObject({
      id: "n1",
      type: "media_storage",
      title: "자동 뉴스 발행 실행 전 미디어 저장소 점검 실패",
      message: "미디어 저장소 상태가 정상적이지 않습니다.",
      metadata: { route: "auto-news" },
    });
  });
});
