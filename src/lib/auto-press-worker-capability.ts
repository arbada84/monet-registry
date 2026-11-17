import "server-only";
import { z } from "zod";

const statusSchema = z.object({ ai: z.object({ selectionContract: z.literal("global-opt-in-v1"), settingsReadable: z.literal(true) }) });

export async function canEnableWorkerGlobalAiSettings(): Promise<boolean> {
  try {
    const url = new URL(process.env.AUTO_PRESS_WORKER_HEALTH_URL?.trim() || "https://culturepeople-auto-press-worker.curpy.workers.dev/health");
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return response.ok && statusSchema.safeParse(await response.json()).success;
  } catch { return false; }
}
