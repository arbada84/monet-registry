import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CULTUREPEOPLE_CATEGORIES,
  isCulturePeopleCategory,
  normalizeCulturePeopleCategory,
  preserveSourceCategoryTag,
} from "@/lib/culturepeople-categories";
import { normalizeWorkerCategory, preserveWorkerSourceCategoryTag } from "../../cloudflare/auto-press-worker/src/index.js";

describe("CulturePeople category policy", () => {
  it("keeps the seven public categories stable", () => {
    expect(CULTUREPEOPLE_CATEGORIES).toEqual(["문화", "엔터", "스포츠", "라이프", "테크·모빌리티", "비즈", "공공"]);
    expect(isCulturePeopleCategory("보도자료")).toBe(false);
  });

  it("normalizes aliases and infers generic press categories from article context", () => {
    expect(normalizeCulturePeopleCategory("공연예술")).toBe("문화");
    expect(normalizeCulturePeopleCategory("보도자료", "AI 반도체 기업이 신규 소프트웨어를 공개했다")).toBe("테크·모빌리티");
    expect(normalizeCulturePeopleCategory("뉴스", "지자체 복지 정책을 발표했다", "문화")).toBe("공공");
  });

  it("preserves nonstandard source categories in tags without duplication", () => {
    expect(preserveSourceCategoryTag("축제,서울", "보도자료")).toBe("축제,서울,원분류:보도자료");
    expect(preserveSourceCategoryTag("원분류:보도자료", "보도자료")).toBe("원분류:보도자료");
    expect(preserveSourceCategoryTag("문화", "문화")).toBe("문화");
  });

  it("uses the same category guard in the Cloudflare worker direct-write path", () => {
    expect(normalizeWorkerCategory("공연", "")).toBe("문화");
    expect(normalizeWorkerCategory("보도자료", "프로야구 선수가 경기에 출전한다")).toBe("스포츠");
    expect(preserveWorkerSourceCategoryTag(["공연"], "보도자료")).toBe("공연,원분류:보도자료");
    const worker = readFileSync("cloudflare/auto-press-worker/src/index.js", "utf8");
    expect(worker).toContain("resolveCategory(edited, options, env, source)");
  });
});
