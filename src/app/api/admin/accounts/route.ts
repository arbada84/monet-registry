import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { AdminAccount } from "@/types/article";
import {
  normalizeAdminAccountInput,
  stripAdminAccountSecrets,
  validateAdminAccountsForSave,
  validatePasswordStrength,
} from "@/lib/admin-account-utils";
import { getTokenPayload } from "@/lib/cookie-auth";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { hashPassword } from "@/lib/password-hash";

const SETTINGS_KEY = "cp-admin-accounts";

function jsonError(error: string, status: number, errors?: string[]) {
  return NextResponse.json({ success: false, error, errors }, { status });
}

async function requireAdmin(request: NextRequest) {
  const payload = await getTokenPayload(request);
  if (!payload?.valid) return null;
  return payload;
}

function toPasswordUpdates(value: unknown): Map<string, string> {
  const updates = new Map<string, string>();
  if (!value || typeof value !== "object" || Array.isArray(value)) return updates;

  for (const [id, password] of Object.entries(value as Record<string, unknown>)) {
    if (typeof password === "string" && password.length > 0) {
      updates.set(id, password);
    }
  }

  return updates;
}

function existingAccountMap(accounts: AdminAccount[]): Map<string, AdminAccount> {
  return new Map(accounts.map((account) => [account.id, account]));
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return jsonError("로그인이 필요합니다.", 401);

    const accounts = await serverGetSetting<AdminAccount[]>(SETTINGS_KEY, []);
    return NextResponse.json({
      success: true,
      accounts: accounts.map(stripAdminAccountSecrets),
    });
  } catch (error) {
    console.error("[Admin Accounts] GET failed:", error);
    return jsonError("관리자 계정 목록을 불러오지 못했습니다.", 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return jsonError("로그인이 필요합니다.", 401);
    if (admin.role !== "superadmin") {
      return jsonError("최고 관리자만 계정을 수정할 수 있습니다.", 403);
    }

    let body: { accounts?: unknown; passwordUpdates?: unknown };
    try {
      body = await request.json();
    } catch {
      return jsonError("요청 본문이 올바르지 않습니다.", 400);
    }

    if (!Array.isArray(body.accounts)) {
      return jsonError("계정 목록이 필요합니다.", 400);
    }

    const existing = await serverGetSetting<AdminAccount[]>(SETTINGS_KEY, []);
    const existingById = existingAccountMap(existing);
    const passwordUpdates = toPasswordUpdates(body.passwordUpdates);
    const rawInputs = body.accounts.map((raw) => (
      raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
    ));

    const normalized = rawInputs.map((input) => {
      const existingAccount = existingById.get(String(input.id ?? ""));
      return normalizeAdminAccountInput(input, existingAccount);
    });

    const errors = validateAdminAccountsForSave(normalized);
    const prepared: AdminAccount[] = [];

    for (const account of normalized) {
      const existingAccount = existingById.get(account.id);
      const requestedPassword = passwordUpdates.get(account.id);
      const clientPassword = rawInputs.find((raw) => String(raw.id ?? "") === account.id)?.password;
      const password = requestedPassword ?? (typeof clientPassword === "string" ? clientPassword : "");

      const nextAccount: AdminAccount = { ...account };
      if (password) {
        const passwordError = validatePasswordStrength(password);
        if (passwordError) {
          errors.push(`${account.username || account.name || account.id}: ${passwordError}`);
        } else {
          nextAccount.passwordHash = await hashPassword(password);
        }
      } else if (existingAccount?.passwordHash) {
        nextAccount.passwordHash = existingAccount.passwordHash;
      } else if (existingAccount?.password) {
        nextAccount.passwordHash = await hashPassword(existingAccount.password);
      } else {
        errors.push(`${account.username || account.name || account.id}: 신규 계정에는 비밀번호가 필요합니다.`);
      }

      delete nextAccount.password;
      prepared.push(nextAccount);
    }

    if (errors.length > 0) {
      return jsonError(errors[0], 400, errors);
    }

    await serverSaveSetting(SETTINGS_KEY, prepared);

    return NextResponse.json({
      success: true,
      accounts: prepared.map(stripAdminAccountSecrets),
    });
  } catch (error) {
    console.error("[Admin Accounts] PUT failed:", error);
    return jsonError("관리자 계정 저장 중 서버 오류가 발생했습니다.", 500);
  }
}
