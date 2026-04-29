import "server-only";

export type DatabaseProvider = "supabase" | "d1";

export interface DatabaseProviderStatus {
  provider: DatabaseProvider;
  configured: boolean;
  runtimeReady: boolean;
  message: string;
  supabase: {
    url: boolean;
    anonKey: boolean;
    serviceKey: boolean;
  };
  d1: {
    binding: string;
    accountId: boolean;
    databaseId: boolean;
    databaseName: boolean;
    apiToken: boolean;
    httpApiReady: boolean;
    adapterReady: boolean;
    readAdapterEnabled: boolean;
    readAdapterReady: boolean;
    settingsDualWriteEnabled: boolean;
    settingsDualWriteReady: boolean;
    settingsDualWriteStrict: boolean;
    articlesDualWriteEnabled: boolean;
    articlesDualWriteReady: boolean;
    articlesDualWriteStrict: boolean;
    commentsReadAdapterEnabled: boolean;
    commentsReadAdapterReady: boolean;
    commentsDualWriteEnabled: boolean;
    commentsDualWriteReady: boolean;
    commentsDualWriteStrict: boolean;
    logsReadAdapterEnabled: boolean;
    logsReadAdapterReady: boolean;
    logsDualWriteEnabled: boolean;
    logsDualWriteReady: boolean;
    logsDualWriteStrict: boolean;
    notificationsReadAdapterEnabled: boolean;
    notificationsReadAdapterReady: boolean;
    notificationsDualWriteEnabled: boolean;
    notificationsDualWriteReady: boolean;
    notificationsDualWriteStrict: boolean;
  };
}

function normalizeProvider(value: string | undefined): DatabaseProvider {
  return value?.toLowerCase() === "d1" ? "d1" : "supabase";
}

export function getDatabaseProvider(): DatabaseProvider {
  return normalizeProvider(process.env.DATABASE_PROVIDER || process.env.DB_PROVIDER);
}

function isD1HttpApiConfigured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID
    && (process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID)
    && process.env.CLOUDFLARE_API_TOKEN
  );
}

export function shouldUseD1ReadAdapter(): boolean {
  return process.env.D1_READ_ADAPTER_ENABLED === "true"
    && isD1HttpApiConfigured();
}

export function shouldDualWriteD1Settings(): boolean {
  return process.env.D1_SETTINGS_DUAL_WRITE_ENABLED === "true"
    && isD1HttpApiConfigured();
}

export function isD1SettingsDualWriteStrict(): boolean {
  return process.env.D1_SETTINGS_DUAL_WRITE_STRICT === "true";
}

export function shouldDualWriteD1Articles(): boolean {
  return process.env.D1_ARTICLES_DUAL_WRITE_ENABLED === "true"
    && isD1HttpApiConfigured();
}

export function isD1ArticlesDualWriteStrict(): boolean {
  return process.env.D1_ARTICLES_DUAL_WRITE_STRICT === "true";
}

export function shouldUseD1CommentsReadAdapter(): boolean {
  return process.env.D1_COMMENTS_READ_ADAPTER_ENABLED === "true"
    && isD1HttpApiConfigured();
}

export function shouldDualWriteD1Comments(): boolean {
  return process.env.D1_COMMENTS_DUAL_WRITE_ENABLED === "true"
    && isD1HttpApiConfigured();
}

export function isD1CommentsDualWriteStrict(): boolean {
  return process.env.D1_COMMENTS_DUAL_WRITE_STRICT === "true";
}

export function shouldUseD1LogsReadAdapter(): boolean {
  return process.env.D1_LOGS_READ_ADAPTER_ENABLED === "true"
    && isD1HttpApiConfigured();
}

export function shouldDualWriteD1Logs(): boolean {
  return process.env.D1_LOGS_DUAL_WRITE_ENABLED === "true"
    && isD1HttpApiConfigured();
}

export function isD1LogsDualWriteStrict(): boolean {
  return process.env.D1_LOGS_DUAL_WRITE_STRICT === "true";
}

export function shouldUseD1NotificationsReadAdapter(): boolean {
  return process.env.D1_NOTIFICATIONS_READ_ADAPTER_ENABLED === "true"
    && isD1HttpApiConfigured();
}

export function shouldDualWriteD1Notifications(): boolean {
  return process.env.D1_NOTIFICATIONS_DUAL_WRITE_ENABLED === "true"
    && isD1HttpApiConfigured();
}

export function isD1NotificationsDualWriteStrict(): boolean {
  return process.env.D1_NOTIFICATIONS_DUAL_WRITE_STRICT === "true";
}

export function getDatabaseProviderStatus(): DatabaseProviderStatus {
  const provider = getDatabaseProvider();
  const supabase = {
    url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceKey: Boolean(process.env.SUPABASE_SERVICE_KEY),
  };
  const d1 = {
    binding: process.env.D1_DATABASE_BINDING || "DB",
    accountId: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
    databaseId: Boolean(process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID),
    databaseName: Boolean(process.env.CLOUDFLARE_D1_PROD_DB || process.env.D1_DATABASE_NAME),
    apiToken: Boolean(process.env.CLOUDFLARE_API_TOKEN),
    httpApiReady: isD1HttpApiConfigured(),
    adapterReady: process.env.D1_RUNTIME_ADAPTER_READY === "true",
    readAdapterEnabled: process.env.D1_READ_ADAPTER_ENABLED === "true",
    readAdapterReady: shouldUseD1ReadAdapter(),
    settingsDualWriteEnabled: process.env.D1_SETTINGS_DUAL_WRITE_ENABLED === "true",
    settingsDualWriteReady: shouldDualWriteD1Settings(),
    settingsDualWriteStrict: isD1SettingsDualWriteStrict(),
    articlesDualWriteEnabled: process.env.D1_ARTICLES_DUAL_WRITE_ENABLED === "true",
    articlesDualWriteReady: shouldDualWriteD1Articles(),
    articlesDualWriteStrict: isD1ArticlesDualWriteStrict(),
    commentsReadAdapterEnabled: process.env.D1_COMMENTS_READ_ADAPTER_ENABLED === "true",
    commentsReadAdapterReady: shouldUseD1CommentsReadAdapter(),
    commentsDualWriteEnabled: process.env.D1_COMMENTS_DUAL_WRITE_ENABLED === "true",
    commentsDualWriteReady: shouldDualWriteD1Comments(),
    commentsDualWriteStrict: isD1CommentsDualWriteStrict(),
    logsReadAdapterEnabled: process.env.D1_LOGS_READ_ADAPTER_ENABLED === "true",
    logsReadAdapterReady: shouldUseD1LogsReadAdapter(),
    logsDualWriteEnabled: process.env.D1_LOGS_DUAL_WRITE_ENABLED === "true",
    logsDualWriteReady: shouldDualWriteD1Logs(),
    logsDualWriteStrict: isD1LogsDualWriteStrict(),
    notificationsReadAdapterEnabled: process.env.D1_NOTIFICATIONS_READ_ADAPTER_ENABLED === "true",
    notificationsReadAdapterReady: shouldUseD1NotificationsReadAdapter(),
    notificationsDualWriteEnabled: process.env.D1_NOTIFICATIONS_DUAL_WRITE_ENABLED === "true",
    notificationsDualWriteReady: shouldDualWriteD1Notifications(),
    notificationsDualWriteStrict: isD1NotificationsDualWriteStrict(),
  };

  if (provider === "d1") {
    const configured = (d1.databaseId || d1.databaseName) && Boolean(d1.binding);
    const runtimeReady = configured && d1.adapterReady;
    return {
      provider,
      configured,
      runtimeReady,
      message: runtimeReady
        ? "D1 database provider is configured and marked runtime-ready."
        : d1.httpApiReady
          ? "D1 database provider is selected and HTTP API is configured, but the runtime adapter is not ready. Keep DATABASE_PROVIDER=supabase until D1 CRUD is implemented and staged."
          : "D1 database provider is selected, but D1 HTTP/API configuration or the runtime adapter is not ready. Keep DATABASE_PROVIDER=supabase until D1 CRUD is implemented and staged.",
      supabase,
      d1,
    };
  }

  const configured = supabase.url && (supabase.anonKey || supabase.serviceKey);
  return {
    provider,
    configured,
    runtimeReady: configured,
    message: configured
      ? "Supabase database provider is configured."
      : "Supabase database provider is selected, but Supabase URL/API key is missing.",
    supabase,
    d1,
  };
}
