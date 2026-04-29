import { NextResponse } from "next/server";
import { registryService } from "@/app/api/_common/services";
import { checkSupabaseHealth } from "@/lib/supabase-health";
import { getDatabaseProviderStatus } from "@/lib/database-provider";
import { getMediaStorageProvider, isMediaStorageConfigured } from "@/lib/media-storage";

export async function GET() {
  try {
    const databaseProvider = getDatabaseProviderStatus();
    const [componentCount, database] = await Promise.all([
      registryService.getTotalCount(),
      databaseProvider.provider === "supabase"
        ? checkSupabaseHealth()
        : Promise.resolve({
            configured: databaseProvider.configured,
            ok: databaseProvider.runtimeReady,
            errorCode: databaseProvider.runtimeReady ? undefined : "request_failed" as const,
            message: databaseProvider.message,
          }),
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
    }, { status: healthy ? 200 : 503 });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        version: "1.0.0",
        initialized: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
