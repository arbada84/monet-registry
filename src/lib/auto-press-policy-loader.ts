import "server-only";

import blockedSubjectsConfig from "../../config/auto-press-blocked-subjects.json";
import {
  STATIC_POLICY_VERSION,
  buildPolicySnapshot,
  type AutoPressPolicySnapshot,
  type AutoPressPolicySubject,
} from "@/lib/auto-press-policy-schema";
import {
  getPublishedPolicySnapshot,
  writeRuntimeObservation,
  type RuntimeObservation,
} from "@/lib/auto-press-policy-repository";

export type AutoPressPolicyConsumer = "next-main" | "next-retry";

export interface LoadedAutoPressPolicy {
  snapshot: AutoPressPolicySnapshot;
  source: RuntimeObservation["source"];
  errorCode: string | null;
}

let staticSnapshotPromise: Promise<AutoPressPolicySnapshot> | null = null;
let lastKnownGood: AutoPressPolicySnapshot | null = null;

function dynamicPolicyEnabled(): boolean {
  return String(process.env.AUTO_PRESS_DYNAMIC_POLICY_ENABLED || "false").trim().toLowerCase() === "true";
}

function staticSubjects(): AutoPressPolicySubject[] {
  return blockedSubjectsConfig.subjects.map((subject) => ({
    ...subject,
    termGroups: subject.termGroups || [],
    status: "active" as const,
    reason: "",
    notes: "",
  }));
}

export function getStaticAutoPressPolicySnapshot(): Promise<AutoPressPolicySnapshot> {
  staticSnapshotPromise ||= buildPolicySnapshot(
    Number(blockedSubjectsConfig.version || STATIC_POLICY_VERSION),
    staticSubjects(),
    "2026-07-27T00:00:00.000Z",
  );
  return staticSnapshotPromise;
}

function safeErrorCode(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/checksum/i.test(text)) return "CHECKSUM_MISMATCH";
  if (/no subjects|empty/i.test(text)) return "EMPTY_POLICY";
  if (/not configured|missing/i.test(text)) return "D1_NOT_CONFIGURED";
  return "D1_READ_FAILED";
}

export async function loadAutoPressPolicy(
  consumer: AutoPressPolicyConsumer,
  invocationId = crypto.randomUUID(),
): Promise<LoadedAutoPressPolicy> {
  let loaded: LoadedAutoPressPolicy;
  if (!dynamicPolicyEnabled()) {
    loaded = { snapshot: await getStaticAutoPressPolicySnapshot(), source: "static-fallback", errorCode: "FEATURE_DISABLED" };
  } else {
    try {
      const snapshot = await getPublishedPolicySnapshot();
      if (!snapshot) throw new Error("Published policy has no subjects.");
      lastKnownGood = snapshot;
      loaded = { snapshot, source: "d1", errorCode: null };
    } catch (error) {
      loaded = lastKnownGood
        ? { snapshot: lastKnownGood, source: "last-known-good", errorCode: safeErrorCode(error) }
        : { snapshot: await getStaticAutoPressPolicySnapshot(), source: "static-fallback", errorCode: safeErrorCode(error) };
    }
  }

  const observedAt = new Date().toISOString();
  writeRuntimeObservation({
    consumer,
    policyVersion: loaded.snapshot.version,
    checksum: loaded.snapshot.checksum,
    source: loaded.source,
    invocationId,
    appliedAt: observedAt,
    observedAt,
    errorCode: loaded.errorCode,
  }).catch(() => undefined);
  return loaded;
}
