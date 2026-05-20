const SCRIPT_SRC_HOSTS = [
  "https://*.googlesyndication.com",
  "https://*.doubleclick.net",
  "https://*.adtrafficquality.google",
  "https://www.googletagservices.com",
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
  "https://*.google.com",
  "https://*.googleapis.com",
  "https://cdn.ampproject.org",
  "https://*.coupang.com",
  "https://*.coupangcdn.com",
  "https://partners.coupang.com",
  "https://ads-partners.coupang.com",
  "https://wcs.naver.com",
  "https://*.pstatic.net",
  "https://*.daumcdn.net",
  "https://*.kakao.com",
  "https://*.kakaocdn.net",
] as const;

export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildContentSecurityPolicy(nonce: string, nodeEnv = process.env.NODE_ENV): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    nodeEnv === "production" ? null : "'unsafe-eval'",
    ...SCRIPT_SRC_HOSTS,
  ].filter(Boolean);

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https:",
    "frame-ancestors 'self' https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://www.google.co.kr",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https:",
  ].join("; ");
}
