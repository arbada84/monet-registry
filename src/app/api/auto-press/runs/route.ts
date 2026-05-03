import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import {
  getAutoPressObservedSummary,
  listAutoPressObservedItems,
  listAutoPressObservedRuns,
} from "@/lib/auto-press-observability";
import { runAutoPress } from "@/app/api/cron/auto-press/route";

function parseCount(value: unknown): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(1, Math.min(Math.trunc(number), 100));
}

function parseKeywords(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
  return undefined;
}

function parsePublishStatus(value: unknown): "게시" | "임시저장" | undefined {
  const status = String(value || "").trim().toLowerCase();
  if (status === "게시" || status === "publish" || status === "published") return "게시";
  if (status === "임시저장" || status === "draft" || status === "temporary") return "임시저장";
  return undefined;
}

async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
  if (await isAuthenticated(req)) return null;
  return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const searchParams = new URL(req.url).searchParams;
    const limit = parseCount(searchParams.get("limit")) || 30;
    const status = searchParams.get("status") || undefined;
    const [runs, summary] = await Promise.all([
      listAutoPressObservedRuns({ limit, status }),
      getAutoPressObservedSummary(),
    ]);
    await Promise.all(runs.map(async (run) => {
      run.items = await listAutoPressObservedItems({ runId: run.id, limit: 120 });
    }));
    return NextResponse.json({ success: true, runs, summary });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "보도자료 실행 현황을 불러오지 못했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const run = await runAutoPress({
      source: "manual",
      triggeredBy: "관리자 수동 실행",
      countOverride: parseCount(body.count),
      keywordsOverride: parseKeywords(body.keywords),
      categoryOverride: typeof body.category === "string" ? body.category : undefined,
      statusOverride: parsePublishStatus(body.publishStatus),
      preview: Boolean(body.preview),
      force: Boolean(body.force),
      dateRangeDays: parseCount(body.dateRangeDays),
      noAiEdit: Boolean(body.noAiEdit),
      wrIds: Array.isArray(body.wrIds) ? body.wrIds.map(String) : undefined,
      excludeUrls: Array.isArray(body.excludeUrls) ? body.excludeUrls.map(String) : undefined,
    });
    return NextResponse.json({ success: true, run });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "보도자료 자동등록 실행에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
