import { lookup } from "node:dns/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertSafeRemoteUrl, isPlausiblySafeRemoteUrl, safeFetch } from "@/lib/safe-remote-url";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

const mockedLookup = vi.mocked(lookup);

function mockLookupAddresses(addresses: Array<{ address: string; family: 4 | 6 }>): void {
  mockedLookup.mockResolvedValue(addresses as never);
}

describe("safe remote URL guard", () => {
  beforeEach(() => {
    mockedLookup.mockReset();
  });

  it("blocks obvious local and unsupported URLs before DNS resolution", () => {
    expect(isPlausiblySafeRemoteUrl("http://127.0.0.1/admin")).toBe(false);
    expect(isPlausiblySafeRemoteUrl("http://169.254.169.254/latest")).toBe(false);
    expect(isPlausiblySafeRemoteUrl("http://[::1]/")).toBe(false);
    expect(isPlausiblySafeRemoteUrl("ftp://example.com/file")).toBe(false);
    expect(isPlausiblySafeRemoteUrl("https://example.com:8443/image.jpg")).toBe(false);
  });

  it("rejects public hostnames that resolve to private addresses", async () => {
    mockLookupAddresses([{ address: "10.0.0.7", family: 4 }]);

    await expect(assertSafeRemoteUrl("https://cdn.example.test/image.jpg")).rejects.toThrow(
      "Private network addresses are not allowed",
    );
  });

  it("allows default-port http and https URLs with public DNS answers", async () => {
    mockLookupAddresses([{ address: "93.184.216.34", family: 4 }]);

    await expect(assertSafeRemoteUrl("https://example.test/image.jpg")).resolves.toBeInstanceOf(URL);
    expect(mockedLookup).toHaveBeenCalledWith("example.test", { all: true, verbatim: true });
  });

  it("blocks redirects that resolve to private addresses", async () => {
    mockedLookup.mockImplementation(async (hostname: string) => {
      if (hostname === "public.example.test") {
        return [{ address: "93.184.216.34", family: 4 }] as never;
      }
      return [{ address: "10.0.0.8", family: 4 }] as never;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, {
        status: 302,
        headers: { location: "https://private.example.test/admin" },
      }));

    await expect(safeFetch("https://public.example.test/image.jpg", { maxRedirects: 1 })).rejects.toThrow(
      "Private network addresses are not allowed",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });
});
