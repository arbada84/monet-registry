import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/cookie-auth";
import { serverGetSetting } from "@/lib/db-server";
import type { Comment } from "@/types/article";

const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function headers() {
  return {
    "Content-Type": "application/json",
    apikey: SERVICE_KEY!,
    Authorization: `Bearer ${SERVICE_KEY}`,
    Prefer: "return=minimal",
  };
}

/**
 * POST /api/admin/migrate-comments
 * 1) comments 테이블 생성 (없으면)
 * 2) cp-comments JSON → comments 테이블로 데이터 이관
 */
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("cp-admin-auth");
  const { valid } = await verifyAuthToken(cookie?.value ?? "");
  if (!valid) return NextResponse.json({ success: false, error: "인증 필요" }, { status: 401 });
  if (!BASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ success: false, error: "Supabase 환경변수 미설정" }, { status: 500 });
  }

  try {
    // 1) 테이블 생성 (RPC로 SQL 실행)
    const createSql = `
      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        article_id TEXT NOT NULL,
        article_title TEXT,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved','pending','spam')),
        ip TEXT,
        parent_id UUID REFERENCES comments(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_comments_article ON comments(article_id);
      CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
      ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comments' AND policyname='comments_public_read') THEN
          CREATE POLICY comments_public_read ON comments FOR SELECT USING (status = 'approved');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comments' AND policyname='comments_service_all') THEN
          CREATE POLICY comments_service_all ON comments FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `;
    const rpcRes = await fetch(`${BASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ query: createSql }),
    });
    // exec_sql RPC가 없으면 Supabase SQL Editor에서 직접 실행 안내
    if (!rpcRes.ok) {
      // 직접 REST로 테이블 존재 확인
      const checkRes = await fetch(`${BASE_URL}/rest/v1/comments?select=id&limit=0`, {
        headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` },
      });
      if (!checkRes.ok) {
        return NextResponse.json({
          success: false,
          error: "comments 테이블이 없습니다. Supabase SQL Editor에서 다음 SQL을 실행하세요.",
          sql: createSql.trim(),
        }, { status: 400 });
      }
    }

    // 2) 기존 JSON 데이터 읽기
    const existing = await serverGetSetting<Comment[]>("cp-comments", []);
    if (existing.length === 0) {
      return NextResponse.json({ success: true, message: "이관할 댓글이 없습니다.", migrated: 0 });
    }

    // 3) 이미 이관된 데이터 확인 (중복 방지)
    const countRes = await fetch(`${BASE_URL}/rest/v1/comments?select=id&limit=1`, {
      headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const existingRows = countRes.ok ? await countRes.json() : [];

    // 이미 데이터가 있으면 스킵
    if (existingRows.length > 0) {
      return NextResponse.json({
        success: true,
        message: "이미 이관된 데이터가 있습니다. 중복 방지를 위해 스킵합니다.",
        existingCount: existingRows.length,
        jsonCount: existing.length,
      });
    }

    // 4) 배치 삽입 (50개씩)
    let migrated = 0;
    const BATCH = 50;
    for (let i = 0; i < existing.length; i += BATCH) {
      const batch = existing.slice(i, i + BATCH).map((c) => ({
        id: c.id,
        article_id: c.articleId,
        article_title: c.articleTitle || null,
        author: c.author,
        content: c.content,
        created_at: c.createdAt,
        status: c.status,
        ip: c.ip || null,
        parent_id: c.parentId || null,
      }));

      const insertRes = await fetch(`${BASE_URL}/rest/v1/comments`, {
        method: "POST",
        headers: { ...headers(), Prefer: "return=minimal" },
        body: JSON.stringify(batch),
      });
      if (insertRes.ok) {
        migrated += batch.length;
      } else {
        const err = await insertRes.text();
        console.error(`[migrate-comments] batch ${i} failed:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${migrated}/${existing.length}건 이관 완료`,
      migrated,
      total: existing.length,
    });
  } catch (e) {
    console.error("[migrate-comments] error:", e);
    return NextResponse.json({ success: false, error: "마이그레이션에 실패했습니다." }, { status: 500 });
  }
}

// GET: 현황 조회
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("cp-admin-auth");
  const { valid } = await verifyAuthToken(cookie?.value ?? "");
  if (!valid) return NextResponse.json({ success: false, error: "인증 필요" }, { status: 401 });

  const jsonComments = await serverGetSetting<Comment[]>("cp-comments", []);

  let tableCount = 0;
  let tableExists = false;
  if (BASE_URL && SERVICE_KEY) {
    const res = await fetch(`${BASE_URL}/rest/v1/comments?select=id`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (res.ok) {
      tableExists = true;
      tableCount = (await res.json()).length;
    }
  }

  return NextResponse.json({
    success: true,
    json: { count: jsonComments.length },
    table: { exists: tableExists, count: tableCount },
  });
}
