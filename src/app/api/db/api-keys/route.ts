/**
 * API 키 관리 (관리자 전용 — middleware가 /api/db/* 보호)
 * GET    /api/db/api-keys      → 키 목록 (prefix·name만, 원본 키 미포함)
 * POST   /api/db/api-keys      → 새 키 생성 → 원본 키 1회 반환
 * DELETE /api/db/api-keys?id=  → 키 삭제
 */
import { NextRequest, NextResponse } from "next/server";
import { generateApiKey, hashApiKey } from "@/lib/api-key";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import type { ApiKeyRecord } from "@/types/article";

async function getKeys(): Promise<ApiKeyRecord[]> {
  return serverGetSetting<ApiKeyRecord[]>("cp-api-keys", []);
}

async function saveKeys(keys: ApiKeyRecord[]): Promise<void> {
  await serverSaveSetting("cp-api-keys", keys);
}

// GET: 키 목록 반환 (prefix + name + createdAt, keyHash 미포함)
export async function GET() {
  try {
    const keys = await getKeys();
    const safe = keys.map(({ id, name, prefix, createdAt }) => ({ id, name, prefix, createdAt }));
    return NextResponse.json({ success: true, keys: safe });
  } catch (e) {
    console.error("[api-keys] GET error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}

// POST: 새 키 생성 — { name } 필수
export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "키 이름을 입력하세요." }, { status: 400 });
    }

    const rawKey = generateApiKey();
    const record: ApiKeyRecord = {
      id: `key_${Date.now()}`,
      name: name.trim(),
      keyHash: hashApiKey(rawKey),
      prefix: rawKey.slice(0, 12),
      createdAt: new Date().toISOString(),
    };

    const keys = await getKeys();
    keys.push(record);
    await saveKeys(keys);

    // 원본 키는 이 응답에서만 반환 — 이후에는 조회 불가
    return NextResponse.json({ success: true, key: rawKey, record: { id: record.id, name: record.name, prefix: record.prefix, createdAt: record.createdAt } }, { status: 201 });
  } catch (e) {
    console.error("[api-keys] POST error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}

// DELETE: 키 삭제 — ?id=key_xxx
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id가 필요합니다." }, { status: 400 });

    const keys = await getKeys();
    const filtered = keys.filter((k) => k.id !== id);
    if (filtered.length === keys.length) {
      return NextResponse.json({ success: false, error: "키를 찾을 수 없습니다." }, { status: 404 });
    }
    await saveKeys(filtered);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api-keys] DELETE error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}
