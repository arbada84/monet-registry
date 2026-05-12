import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("database provider configuration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("defaults to Supabase unless D1 is explicitly selected", async () => {
    const { getDatabaseProvider } = await import("@/lib/database-provider");

    expect(getDatabaseProvider()).toBe("supabase");

    vi.stubEnv("DATABASE_PROVIDER", "unknown");
    expect(getDatabaseProvider()).toBe("supabase");

    vi.stubEnv("DATABASE_PROVIDER", "d1");
    expect(getDatabaseProvider()).toBe("d1");
  });

  it("reports Supabase as runtime-ready when Supabase URL and key exist", async () => {
    const { getDatabaseProviderStatus } = await import("@/lib/database-provider");

    vi.stubEnv("DATABASE_PROVIDER", "supabase");
    expect(getDatabaseProviderStatus()).toMatchObject({
      provider: "supabase",
      configured: false,
      runtimeReady: false,
    });

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    expect(getDatabaseProviderStatus()).toMatchObject({
      provider: "supabase",
      configured: true,
      runtimeReady: true,
    });
  });

  it("blocks D1 from being runtime-ready until the adapter is explicitly marked ready", async () => {
    const { getDatabaseProviderStatus } = await import("@/lib/database-provider");

    vi.stubEnv("DATABASE_PROVIDER", "d1");
    vi.stubEnv("CLOUDFLARE_D1_PROD_DB", "culturepeople-prod");
    vi.stubEnv("D1_DATABASE_BINDING", "DB");

    expect(getDatabaseProviderStatus()).toMatchObject({
      provider: "d1",
      configured: true,
      runtimeReady: false,
      d1: {
        binding: "DB",
        httpApiReady: false,
        databaseName: true,
        adapterReady: false,
        readAdapterEnabled: false,
        readAdapterReady: false,
        settingsDualWriteEnabled: false,
        settingsDualWriteReady: false,
        articlesDualWriteEnabled: false,
        articlesDualWriteReady: false,
        commentsReadAdapterEnabled: false,
        commentsReadAdapterReady: false,
        commentsDualWriteEnabled: false,
        commentsDualWriteReady: false,
        logsReadAdapterEnabled: false,
        logsReadAdapterReady: false,
        logsDualWriteEnabled: false,
        logsDualWriteReady: false,
        notificationsReadAdapterEnabled: false,
        notificationsReadAdapterReady: false,
        notificationsDualWriteEnabled: false,
        notificationsDualWriteReady: false,
      },
    });

    vi.stubEnv("D1_RUNTIME_ADAPTER_READY", "true");

    expect(getDatabaseProviderStatus()).toMatchObject({
      provider: "d1",
      configured: true,
      runtimeReady: true,
      d1: {
        adapterReady: true,
      },
    });
  });

  it("reports D1 HTTP API readiness separately from runtime cutover readiness", async () => {
    const { getDatabaseProviderStatus } = await import("@/lib/database-provider");

    vi.stubEnv("DATABASE_PROVIDER", "d1");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");

    expect(getDatabaseProviderStatus()).toMatchObject({
      provider: "d1",
      configured: true,
      runtimeReady: false,
      d1: {
        accountId: true,
        databaseId: true,
        apiToken: true,
        httpApiReady: true,
        adapterReady: false,
        readAdapterEnabled: false,
        readAdapterReady: false,
        settingsDualWriteEnabled: false,
        settingsDualWriteReady: false,
        articlesDualWriteEnabled: false,
        articlesDualWriteReady: false,
        commentsReadAdapterEnabled: false,
        commentsReadAdapterReady: false,
        commentsDualWriteEnabled: false,
        commentsDualWriteReady: false,
        logsReadAdapterEnabled: false,
        logsReadAdapterReady: false,
        logsDualWriteEnabled: false,
        logsDualWriteReady: false,
        notificationsReadAdapterEnabled: false,
        notificationsReadAdapterReady: false,
        notificationsDualWriteEnabled: false,
        notificationsDualWriteReady: false,
      },
    });
  });

  it("keeps the D1 read adapter behind its own explicit flag and HTTP API envs", async () => {
    const { getDatabaseProviderStatus, shouldUseD1ReadAdapter } = await import("@/lib/database-provider");

    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");

    expect(shouldUseD1ReadAdapter()).toBe(false);
    expect(getDatabaseProviderStatus()).toMatchObject({
      d1: {
        httpApiReady: true,
        readAdapterEnabled: false,
        readAdapterReady: false,
      },
    });

    vi.stubEnv("D1_READ_ADAPTER_ENABLED", "true");

    expect(shouldUseD1ReadAdapter()).toBe(true);
    expect(getDatabaseProviderStatus()).toMatchObject({
      d1: {
        readAdapterEnabled: true,
        readAdapterReady: true,
      },
    });
  });

  it("keeps D1 settings dual-write behind its own explicit flag and HTTP API envs", async () => {
    const {
      getDatabaseProviderStatus,
      isD1SettingsDualWriteStrict,
      shouldDualWriteD1Settings,
    } = await import("@/lib/database-provider");

    vi.stubEnv("D1_SETTINGS_DUAL_WRITE_ENABLED", "true");
    expect(shouldDualWriteD1Settings()).toBe(false);
    expect(getDatabaseProviderStatus()).toMatchObject({
      d1: {
        settingsDualWriteEnabled: true,
        settingsDualWriteReady: false,
        settingsDualWriteStrict: false,
      },
    });

    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    vi.stubEnv("D1_SETTINGS_DUAL_WRITE_STRICT", "true");

    expect(shouldDualWriteD1Settings()).toBe(true);
    expect(isD1SettingsDualWriteStrict()).toBe(true);
    expect(getDatabaseProviderStatus()).toMatchObject({
      d1: {
        settingsDualWriteReady: true,
        settingsDualWriteStrict: true,
      },
    });
  });

  it("keeps D1 article dual-write behind its own explicit flag and HTTP API envs", async () => {
    const {
      getDatabaseProviderStatus,
      isD1ArticlesDualWriteStrict,
      shouldDualWriteD1Articles,
    } = await import("@/lib/database-provider");

    vi.stubEnv("D1_ARTICLES_DUAL_WRITE_ENABLED", "true");
    expect(shouldDualWriteD1Articles()).toBe(false);
    expect(getDatabaseProviderStatus()).toMatchObject({
      d1: {
        articlesDualWriteEnabled: true,
        articlesDualWriteReady: false,
        articlesDualWriteStrict: false,
      },
    });

    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    vi.stubEnv("D1_ARTICLES_DUAL_WRITE_STRICT", "true");

    expect(shouldDualWriteD1Articles()).toBe(true);
    expect(isD1ArticlesDualWriteStrict()).toBe(true);
    expect(getDatabaseProviderStatus()).toMatchObject({
      d1: {
        articlesDualWriteReady: true,
        articlesDualWriteStrict: true,
      },
    });
  });

  it("keeps D1 comments read and dual-write behind explicit flags and HTTP API envs", async () => {
    const {
      getDatabaseProviderStatus,
      isD1CommentsDualWriteStrict,
      shouldDualWriteD1Comments,
      shouldUseD1CommentsReadAdapter,
    } = await import("@/lib/database-provider");

    vi.stubEnv("D1_COMMENTS_READ_ADAPTER_ENABLED", "true");
    vi.stubEnv("D1_COMMENTS_DUAL_WRITE_ENABLED", "true");
    expect(shouldUseD1CommentsReadAdapter()).toBe(false);
    expect(shouldDualWriteD1Comments()).toBe(false);
    expect(getDatabaseProviderStatus()).toMatchObject({
      d1: {
        commentsReadAdapterEnabled: true,
        commentsReadAdapterReady: false,
        commentsDualWriteEnabled: true,
        commentsDualWriteReady: false,
        commentsDualWriteStrict: false,
      },
    });

    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    vi.stubEnv("D1_COMMENTS_DUAL_WRITE_STRICT", "true");

    expect(shouldUseD1CommentsReadAdapter()).toBe(true);
    expect(shouldDualWriteD1Comments()).toBe(true);
    expect(isD1CommentsDualWriteStrict()).toBe(true);
    expect(getDatabaseProviderStatus()).toMatchObject({
      d1: {
        commentsReadAdapterReady: true,
        commentsDualWriteReady: true,
        commentsDualWriteStrict: true,
      },
    });
  });

  it("keeps D1 logs read and dual-write behind explicit flags and HTTP API envs", async () => {
    const {
      getDatabaseProviderStatus,
      isD1LogsDualWriteStrict,
      shouldDualWriteD1Logs,
      shouldUseD1LogsReadAdapter,
    } = await import("@/lib/database-provider");

    vi.stubEnv("D1_LOGS_READ_ADAPTER_ENABLED", "true");
    vi.stubEnv("D1_LOGS_DUAL_WRITE_ENABLED", "true");
    expect(shouldUseD1LogsReadAdapter()).toBe(false);
    expect(shouldDualWriteD1Logs()).toBe(false);
    expect(getDatabaseProviderStatus()).toMatchObject({
      d1: {
        logsReadAdapterEnabled: true,
        logsReadAdapterReady: false,
        logsDualWriteEnabled: true,
        logsDualWriteReady: false,
        logsDualWriteStrict: false,
      },
    });

    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    vi.stubEnv("D1_LOGS_DUAL_WRITE_STRICT", "true");

    expect(shouldUseD1LogsReadAdapter()).toBe(true);
    expect(shouldDualWriteD1Logs()).toBe(true);
    expect(isD1LogsDualWriteStrict()).toBe(true);
    expect(getDatabaseProviderStatus()).toMatchObject({
      d1: {
        logsReadAdapterReady: true,
        logsDualWriteReady: true,
        logsDualWriteStrict: true,
      },
    });
  });

  it("keeps D1 notifications read and dual-write behind explicit flags and HTTP API envs", async () => {
    const {
      getDatabaseProviderStatus,
      isD1NotificationsDualWriteStrict,
      shouldDualWriteD1Notifications,
      shouldUseD1NotificationsReadAdapter,
    } = await import("@/lib/database-provider");

    vi.stubEnv("D1_NOTIFICATIONS_READ_ADAPTER_ENABLED", "true");
    vi.stubEnv("D1_NOTIFICATIONS_DUAL_WRITE_ENABLED", "true");
    expect(shouldUseD1NotificationsReadAdapter()).toBe(false);
    expect(shouldDualWriteD1Notifications()).toBe(false);
    expect(getDatabaseProviderStatus()).toMatchObject({
      d1: {
        notificationsReadAdapterEnabled: true,
        notificationsReadAdapterReady: false,
        notificationsDualWriteEnabled: true,
        notificationsDualWriteReady: false,
        notificationsDualWriteStrict: false,
      },
    });

    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    vi.stubEnv("D1_NOTIFICATIONS_DUAL_WRITE_STRICT", "true");

    expect(shouldUseD1NotificationsReadAdapter()).toBe(true);
    expect(shouldDualWriteD1Notifications()).toBe(true);
    expect(isD1NotificationsDualWriteStrict()).toBe(true);
    expect(getDatabaseProviderStatus()).toMatchObject({
      d1: {
        notificationsReadAdapterReady: true,
        notificationsDualWriteReady: true,
        notificationsDualWriteStrict: true,
      },
    });
  });
});
