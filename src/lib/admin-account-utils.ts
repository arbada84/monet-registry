import type { AdminAccount } from "@/types/article";

export type PublicAdminAccount = Omit<AdminAccount, "password" | "passwordHash">;

const VALID_ROLES = new Set<AdminAccount["role"]>(["superadmin", "admin", "reporter"]);

function text(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  const trimmed = text(value);
  return trimmed ? trimmed : undefined;
}

function optionalInputText(input: Record<string, unknown>, key: string, fallback?: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(input, key)) return fallback;
  return optionalText(input[key]);
}

export function normalizeAdminRole(role: unknown): AdminAccount["role"] {
  if (VALID_ROLES.has(role as AdminAccount["role"])) return role as AdminAccount["role"];
  if (role === "editor") return "reporter";
  return "reporter";
}

export function stripAdminAccountSecrets(account: AdminAccount): PublicAdminAccount {
  const { password: _password, passwordHash: _passwordHash, ...safe } = account;
  return {
    ...safe,
    role: normalizeAdminRole(safe.role),
    active: safe.active !== false,
  };
}

export function normalizeAdminAccountInput(input: Record<string, unknown>, existing?: AdminAccount): AdminAccount {
  const now = new Date().toISOString();
  const id = text(input.id, existing?.id) || crypto.randomUUID();

  return {
    id,
    username: text(input.username, existing?.username),
    name: text(input.name, existing?.name),
    role: normalizeAdminRole(input.role ?? existing?.role),
    email: optionalInputText(input, "email", existing?.email),
    phone: optionalInputText(input, "phone", existing?.phone),
    department: optionalInputText(input, "department", existing?.department),
    title: optionalInputText(input, "title", existing?.title),
    photo: optionalInputText(input, "photo", existing?.photo),
    bio: optionalInputText(input, "bio", existing?.bio),
    active: typeof input.active === "boolean" ? input.active : existing?.active ?? true,
    joinDate: text(input.joinDate, existing?.joinDate) || now.slice(0, 10),
    createdAt: text(input.createdAt, existing?.createdAt) || now,
    lastLogin: text(input.lastLogin, existing?.lastLogin) || "-",
  };
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "비밀번호는 영문과 숫자를 모두 포함해야 합니다.";
  }
  return null;
}

export function validateAdminAccountsForSave(accounts: AdminAccount[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const usernames = new Set<string>();

  if (accounts.length === 0) {
    errors.push("관리자 계정은 최소 1개 이상 필요합니다.");
  }

  for (const account of accounts) {
    if (!account.id) errors.push("계정 ID가 비어 있습니다.");
    if (ids.has(account.id)) errors.push(`중복 계정 ID가 있습니다: ${account.id}`);
    ids.add(account.id);

    if (!account.name) errors.push("관리자 이름을 입력해야 합니다.");
    if (!account.username) {
      errors.push("로그인 아이디를 입력해야 합니다.");
    } else {
      const key = account.username.toLowerCase();
      if (usernames.has(key)) errors.push(`중복 로그인 아이디가 있습니다: ${account.username}`);
      usernames.add(key);
    }
  }

  const activeSuperadmins = accounts.filter((account) => (
    account.role === "superadmin" && account.active !== false
  ));
  if (activeSuperadmins.length === 0) {
    errors.push("활성 최고 관리자는 최소 1명 이상 필요합니다.");
  }

  return errors;
}
