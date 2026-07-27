import { describe, expect, it } from "vitest";

describe("category audit and dry-run planner", () => {
  it("reports legacy categories and builds provider-specific rollback-ready targets", async () => {
    // @ts-ignore Node operational script imported directly for unit coverage.
    const { buildCategoryAudit } = await import("../../scripts/audit-culturepeople-categories.mjs");
    // @ts-ignore Node operational script imported directly for unit coverage.
    const { buildCategoryApplyPlan } = await import("../../scripts/normalize-culturepeople-categories.mjs");
    const report = buildCategoryAudit({
      backupDir: "/backup/latest",
      articles: [
        { id: "d1-1", no: 1, status: "게시", title: "공연 소식", category: "공연예술", backup_meta: { source_database: "d1" } },
        { id: "sb-2", no: 2, status: "게시", title: "정책 발표", summary: "정부 복지 정책", category: "보도자료", backup_meta: { source_database: "supabase" } },
        { id: "d1-3", no: 3, status: "게시", title: "문화 기사", category: "문화", backup_meta: { source_database: "d1" } },
      ],
    });

    expect(report.summary).toMatchObject({ totalArticles: 3, changeCandidates: 2, publishedChangeCandidates: 2 });
    expect(report.changes.map((row: any) => row.newCategory)).toEqual(["문화", "공공"]);
    expect(buildCategoryApplyPlan(report, "d1").changes).toHaveLength(1);
    expect(buildCategoryApplyPlan(report, "supabase").changes).toHaveLength(1);
  });
});
