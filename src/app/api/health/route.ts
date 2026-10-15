import { NextResponse } from "next/server";
import { registryService } from "@/app/api/_common/services";
import { checkSupabaseHealth } from "@/lib/supabase-health";
import { getDatabaseProviderStatus } from "@/lib/database-provider";
import { getMediaStorageProvider, isMediaStorageConfigured } from "@/lib/media-storage";
import { d1HttpHealthCheck } from "@/lib/d1-http-client";

export async function GET() {
  try {
    const databaseProvider = getDatabaseProviderStatus();
    const [componentCount, database] = await Promise.all([
      registryService.getTotalCount(),
      databaseProvider.provider === "supabase"
        ? checkSupabaseHealth()
        : d1HttpHealthCheck({ timeoutMs: 5000 }),
    ]);
    const mediaStorage = {
      provider: getMediaStorageProvider(),
      configured: isMediaStorageConfigured(),
    };
    const healthy = database.ok && mediaStorage.configured;

    return NextResponse.json({
      status: healthy ? "ok" : "error",
      version: "1.0.0",
      initialized: healthy,
      component_count: componentCount,
      databaseProvider,
      database,
      mediaStorage,
    }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        version: "1.0.0",
        initialized: false,
        error: "Database or service temporarily unavailable",
      },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }
}
