// Only presentation settings that already have anonymous read access belong here.
export const PUBLIC_SITE_SETTING_KEYS = [
  "cp-site-settings",
  "cp-categories",
  "cp-menus",
  "cp-about",
  "cp-sns-settings",
] as const;

export function isPublicSiteSetting(key: string): boolean {
  return (PUBLIC_SITE_SETTING_KEYS as readonly string[]).includes(key);
}

export const PUBLIC_SETTING_CACHE_SECONDS = 60;
