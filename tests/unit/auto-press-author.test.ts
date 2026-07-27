import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const serverGetSettingMock = vi.fn();

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: serverGetSettingMock,
}));

describe("auto-press author resolution", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("resolves empty or legacy auto-press authors to the Park Youngrae admin account", async () => {
    serverGetSettingMock.mockResolvedValue([
      {
        id: "acc-park",
        username: "arbada",
        name: "박영래",
        email: "youngrae_park@culturepeople.co.kr",
        role: "superadmin",
        active: true,
      },
    ]);

    const { resolveAutoPressAuthorProfile } = await import("@/lib/auto-press-author");

    await expect(resolveAutoPressAuthorProfile("")).resolves.toMatchObject({
      name: "박영래",
      email: "youngrae_park@culturepeople.co.kr",
      accountId: "acc-park",
      username: "arbada",
    });
    await expect(resolveAutoPressAuthorProfile("CulturePeople AI")).resolves.toMatchObject({
      name: "박영래",
      email: "youngrae_park@culturepeople.co.kr",
    });
  });

  it("falls back to the requested author name when no admin account can be read", async () => {
    serverGetSettingMock.mockRejectedValue(new Error("settings unavailable"));

    const { resolveAutoPressAuthorProfile } = await import("@/lib/auto-press-author");

    await expect(resolveAutoPressAuthorProfile("김기자")).resolves.toEqual({ name: "김기자" });
  });
});
