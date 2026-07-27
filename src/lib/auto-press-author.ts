import "server-only";

import { serverGetSetting } from "@/lib/db-server";
import type { AdminAccount } from "@/types/article";

export const DEFAULT_AUTO_PRESS_AUTHOR_NAME = "박영래";

const LEGACY_AUTO_PRESS_AUTHORS = new Set(["", "CulturePeople AI", "컬처피플 AI", "편집팀"]);

export interface AutoPressAuthorProfile {
  name: string;
  email?: string;
  accountId?: string;
  username?: string;
}

function text(value: unknown): string {
  return String(value || "").trim();
}

function normalizeComparable(value: unknown): string {
  return text(value).toLowerCase();
}

function findAccount(accounts: AdminAccount[], target: string): AdminAccount | undefined {
  const normalizedTarget = normalizeComparable(target);
  if (!normalizedTarget) return undefined;
  const activeAccounts = accounts.filter((account) => account && account.active !== false);
  return activeAccounts.find((account) => normalizeComparable(account.name) === normalizedTarget)
    || activeAccounts.find((account) => normalizeComparable(account.username) === normalizedTarget)
    || activeAccounts.find((account) => normalizeComparable(account.id) === normalizedTarget);
}

export async function resolveAutoPressAuthorProfile(preferredAuthor?: string): Promise<AutoPressAuthorProfile> {
  const preferred = text(preferredAuthor);
  const target = LEGACY_AUTO_PRESS_AUTHORS.has(preferred) ? DEFAULT_AUTO_PRESS_AUTHOR_NAME : (preferred || DEFAULT_AUTO_PRESS_AUTHOR_NAME);

  try {
    const accounts = await serverGetSetting<AdminAccount[]>("cp-admin-accounts", []);
    const account = findAccount(accounts, target) || findAccount(accounts, DEFAULT_AUTO_PRESS_AUTHOR_NAME);
    if (account?.name) {
      return {
        name: account.name.trim(),
        email: text(account.email) || undefined,
        accountId: account.id,
        username: account.username,
      };
    }
  } catch {
    // Author resolution must not block automatic press registration.
  }

  return { name: target || DEFAULT_AUTO_PRESS_AUTHOR_NAME };
}
