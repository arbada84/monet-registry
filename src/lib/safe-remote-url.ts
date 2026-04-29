import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_PORTS = new Set(["", "80", "443"]);
const BLOCKED_HOSTS = new Set([
  "localhost",
  "ip6-localhost",
  "metadata",
  "metadata.google.internal",
]);
const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal"];

export class UnsafeRemoteUrlError extends Error {
  constructor(message = "Unsafe remote URL") {
    super(message);
    this.name = "UnsafeRemoteUrlError";
  }
}

export type SafeFetchInit = Omit<RequestInit, "redirect"> & {
  maxRedirects?: number;
};

export function isPlausiblySafeRemoteUrl(rawUrl: string | URL): boolean {
  try {
    const url = toUrl(rawUrl);
    validateUrlShape(url);

    const hostname = normalizeHostname(url.hostname);
    if (isIP(hostname) && isBlockedIp(hostname)) return false;

    return true;
  } catch {
    return false;
  }
}

export async function isSafeRemoteUrl(rawUrl: string | URL): Promise<boolean> {
  try {
    await assertSafeRemoteUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}

export async function assertSafeRemoteUrl(rawUrl: string | URL): Promise<URL> {
  const url = toUrl(rawUrl);
  validateUrlShape(url);

  const hostname = normalizeHostname(url.hostname);
  const ipVersion = isIP(hostname);

  if (ipVersion) {
    assertSafeIp(hostname);
    return url;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new UnsafeRemoteUrlError("Remote host did not resolve");
  }

  for (const address of addresses) {
    assertSafeIp(address.address);
  }

  return url;
}

export async function safeFetch(rawUrl: string | URL, init: SafeFetchInit = {}): Promise<Response> {
  const { maxRedirects = 5, ...requestInit } = init;
  let currentUrl = await assertSafeRemoteUrl(rawUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(currentUrl.href, {
      ...requestInit,
      redirect: "manual",
    });

    if (!isRedirectStatus(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    if (redirectCount === maxRedirects) {
      throw new UnsafeRemoteUrlError("Too many redirects while fetching remote URL");
    }

    await response.body?.cancel().catch(() => undefined);
    currentUrl = await assertSafeRemoteUrl(new URL(location, currentUrl));
  }

  throw new UnsafeRemoteUrlError("Too many redirects while fetching remote URL");
}

function toUrl(rawUrl: string | URL): URL {
  return rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
}

function validateUrlShape(url: URL): void {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeRemoteUrlError("Only http and https URLs are allowed");
  }

  if (!url.hostname) {
    throw new UnsafeRemoteUrlError("Remote URL is missing a hostname");
  }

  if (url.username || url.password) {
    throw new UnsafeRemoteUrlError("Credentials are not allowed in remote URLs");
  }

  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeRemoteUrlError("Only default http and https ports are allowed");
  }

  const hostname = normalizeHostname(url.hostname);
  if (BLOCKED_HOSTS.has(hostname) || BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new UnsafeRemoteUrlError("Private hostnames are not allowed");
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[(.*)]$/, "$1").replace(/\.$/, "");
}

function assertSafeIp(address: string): void {
  if (isBlockedIp(address)) {
    throw new UnsafeRemoteUrlError("Private network addresses are not allowed");
  }
}

function isBlockedIp(address: string): boolean {
  const normalized = normalizeHostname(address);
  const ipVersion = isIP(normalized);

  if (ipVersion === 4) {
    return isBlockedIpv4(normalized);
  }

  if (ipVersion === 6) {
    return isBlockedIpv6(normalized);
  }

  return true;
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b, c, d] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    (a === 224 && b === 0 && c === 0) ||
    a >= 224 ||
    (a === 255 && b === 255 && c === 255 && d === 255)
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized === "::" || normalized === "::1") return true;

  const mappedIpv4 = normalized.match(/^(?:0:0:0:0:0:ffff:|::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4[1]);

  const firstHextet = getFirstIpv6Hextet(normalized);
  if (firstHextet === null) return true;

  return (
    (firstHextet & 0xfe00) === 0xfc00 ||
    (firstHextet & 0xffc0) === 0xfe80 ||
    (firstHextet & 0xff00) === 0xff00 ||
    firstHextet === 0x2002 ||
    normalized.startsWith("2001:db8:")
  );
}

function getFirstIpv6Hextet(address: string): number | null {
  const firstPart = address.startsWith("::") ? "0" : address.split(":")[0];
  const value = Number.parseInt(firstPart, 16);
  return Number.isFinite(value) ? value : null;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
