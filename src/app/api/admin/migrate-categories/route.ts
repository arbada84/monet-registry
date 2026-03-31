import { NextRequest, NextResponse } from "next/server";
import { serverSaveSetting } from "@/lib/db-server";
import { isAuthenticated } from "@/lib/cookie-auth";

const NEW_CATEGORIES = [
  { id: "cat-1", name: "엔터", slug: "enter", description: "스타·방송·OTT·공연·팬덤 등 대중문화 이슈와 흐름을 다룹니다.", order: 1, visible: true, parentId: null },
  { id: "cat-2", name: "스포츠", slug: "sports", description: "프로스포츠부터 생활운동까지 '움직임이 만드는 문화'를 전합니다.", order: 2, visible: true, parentId: null },
  { id: "cat-3", name: "라이프", slug: "life", description: "패션·뷰티·푸드·여행·공간·관계 등 일상을 바꾸는 취향과 생활문화를 담습니다.", order: 3, visible: true, parentId: null },
  { id: "cat-4", name: "테크·모빌리티", slug: "tech-mobility", description: "기술과 이동이 일상 경험을 바꾸는 순간을 쉽게 풀어줍니다.", order: 4, visible: true, parentId: null },
  { id: "cat-5", name: "비즈", slug: "biz", description: "문화가 '돈·일·조직'으로 이어지는 산업과 브랜드 전략을 다룹니다.", order: 5, visible: true, parentId: null },
  { id: "cat-6", name: "공공", slug: "public", description: "정책·도시·공공서비스가 시민의 삶과 문화에 미치는 변화를 다룹니다.", order: 6, visible: true, parentId: null },
];

async function runMigration() {
  try {
    await serverSaveSetting("cp-categories", NEW_CATEGORIES);
    return NextResponse.json({
      success: true,
      count: NEW_CATEGORIES.length,
      categories: NEW_CATEGORIES.map((c) => `${c.name} (${c.slug})`),
      message: `카테고리 ${NEW_CATEGORIES.length}개로 업데이트 완료`,
    });
  } catch (e) {
    console.error("[migrate-categories] error:", e);
    return NextResponse.json(
      { success: false, error: "카테고리 마이그레이션에 실패했습니다." },
      { status: 500 }
    );
  }
}

// GET: 브라우저에서 직접 접근 가능 (어드민 로그인 필요)
export async function GET(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runMigration();
}

// POST: 버튼에서 호출
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runMigration();
}
