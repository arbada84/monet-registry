/**
 * DB 자동 백업 크론 핸들러
 * GET  /api/cron/backup — Vercel Cron 또는 외부 스케줄러에서 호출
 * POST /api/cron/backup — 수동 백업 / 복구
 *
 * POST Body:
 *   { action: "backup", type?: "manual"|"weekly_full"|"monthly_full", label?: string }
 *   { action: "incremental", type?: "hourly"|"daily", label?: string }
 *   { action: "restore", label: string }
 *   { action: "list" }
 *   { action: "cleanup" }
 *   { action: "status" }
 *
 * 인증: CRON_SECRET 헤더 또는 관리자 쿠키
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";
import { getDatabaseProvider } from "@/lib/database-provider";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );

async function authenticate(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const bearer =
      req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    if (bearer && timingSafeEqual(bearer, secret)) return true;
  }
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

function d1BackupResponse(action = "backup", cron = false) {
  return NextResponse.json({
    ok: cron || action === "status",
    provider: "d1",
    skipped: true,
    action,
    message: "Supabase backup RPC is skipped because the active database provider is D1.",
    nextAction: "Use Cloudflare D1 backup/export controls until a D1-native backup job is implemented.",
  }, { status: cron || action === "status" ? 200 : 501 });
}

// GET: Vercel Cron에서 호출 (hourly 백업 + 정리)
export async function GET(req: NextRequest) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (getDatabaseProvider() === "d1") {
    return d1BackupResponse("hourly", true);
  }

  const db = supabaseAdmin();
  try {
    // hourly 증분 백업 실행
    const { data: backupResult, error: backupErr } = await db.rpc(
      "create_incremental_backup",
      { p_label: null, p_type: "hourly" },
    );
    if (backupErr) throw backupErr;

    // 오래된 백업 정리
    const { data: cleanupResult, error: cleanupErr } = await db.rpc(
      "cleanup_old_backups",
    );
    if (cleanupErr) throw cleanupErr;

    return NextResponse.json({
      ok: true,
      backup: backupResult,
      cleanup: cleanupResult,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: 수동 백업/복구/목록/정리
export async function POST(req: NextRequest) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action || "backup";

  if (getDatabaseProvider() === "d1") {
    return d1BackupResponse(action);
  }

  const db = supabaseAdmin();

  try {
    switch (action) {
      case "backup": {
        const type = body.type || "manual";
        const label = body.label || null;
        const { data, error } = await db.rpc("create_articles_backup", {
          p_label: label,
          p_type: type,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true, result: data });
      }

      case "incremental": {
        const type = body.type || "daily";
        const label = body.label || null;
        const { data, error } = await db.rpc("create_incremental_backup", {
          p_label: label,
          p_type: type,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true, result: data });
      }

      case "status": {
        const { data: meta } = await db
          .from("backup_meta")
          .select("*")
          .order("backup_at", { ascending: false })
          .limit(10);
        const { data: sizeData } = await db.rpc("exec_sql", {
          sql: "SELECT pg_size_pretty(pg_total_relation_size('articles_backup')) as backup_size",
        });
        return NextResponse.json({
          ok: true,
          recent_backups: meta,
          storage: sizeData,
        });
      }

      case "restore": {
        if (!body.label) {
          return NextResponse.json(
            { error: "label is required for restore" },
            { status: 400 },
          );
        }
        const { data, error } = await db.rpc(
          "restore_articles_from_backup",
          { p_label: body.label },
        );
        if (error) throw error;
        return NextResponse.json({ ok: true, result: data });
      }

      case "list": {
        const { data, error } = await db
          .from("backup_meta")
          .select("*")
          .order("backup_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return NextResponse.json({ ok: true, backups: data });
      }

      case "cleanup": {
        const { data, error } = await db.rpc("cleanup_old_backups");
        if (error) throw error;
        return NextResponse.json({ ok: true, result: data });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
