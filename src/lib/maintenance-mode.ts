import "server-only";

export interface MaintenanceModeSettings {
  enabled: boolean;
  message?: string;
  enabledAt?: string;
  enabledBy?: string;
  expiresAt?: string;
}

export const MAINTENANCE_SETTING_KEY = "cp-maintenance-mode";
export const DEFAULT_MAINTENANCE_MESSAGE = "현재 사이트 점검 중입니다. 잠시 후 다시 이용해 주세요.";

export function isMaintenanceActive(settings: MaintenanceModeSettings | null | undefined, now = new Date()): boolean {
  if (!settings?.enabled) return false;
  if (!settings.expiresAt) return true;
  const expiresAt = new Date(settings.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return true;
  return expiresAt.getTime() > now.getTime();
}

export function getMaintenanceMessage(settings: MaintenanceModeSettings | null | undefined): string {
  return settings?.message?.trim() || DEFAULT_MAINTENANCE_MESSAGE;
}
