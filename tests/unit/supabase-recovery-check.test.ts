import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

type Probe = {
  name: string;
  ok: boolean;
  status: number | null;
  restricted: boolean;
  authFailed: boolean;
  networkUnavailable: boolean;
};

function probe(overrides: Partial<Probe>): Probe {
  return {
    name: "service_rest_articles",
    ok: false,
    status: null,
    restricted: false,
    authFailed: false,
    networkUnavailable: false,
    ...overrides,
  };
}

function report(probes: Probe[]) {
  return {
    config: {
      hasUrl: true,
      hasServiceKey: true,
    },
    probes,
  };
}

describe("supabase recovery classification", () => {
  it("classifies quota restrictions from REST or Storage 402 responses", async () => {
    const { classify } = await import(pathToFileURL(`${process.cwd()}/scripts/supabase-recovery-check.mjs`).href);

    expect(classify(report([
      probe({ name: "service_rest_articles", status: 402, restricted: true }),
      probe({ name: "service_storage_bucket", status: 402, restricted: true }),
      probe({ name: "service_storage_list", status: 402, restricted: true }),
    ]))).toMatchObject({
      ok: false,
      phase: "quota_restricted",
      restricted: true,
      storageRestricted: true,
    });
  });

  it("classifies an invalid service role key separately from quota restriction", async () => {
    const { classify } = await import(pathToFileURL(`${process.cwd()}/scripts/supabase-recovery-check.mjs`).href);

    expect(classify(report([
      probe({ name: "service_rest_articles", status: 401, authFailed: true }),
      probe({ name: "service_storage_bucket", status: 401, authFailed: true }),
      probe({ name: "service_storage_list", status: 401, authFailed: true }),
    ]))).toMatchObject({
      phase: "service_key_invalid",
      restricted: false,
    });
  });

  it("reports ready when REST and Storage probes are readable", async () => {
    const { classify } = await import(pathToFileURL(`${process.cwd()}/scripts/supabase-recovery-check.mjs`).href);

    expect(classify(report([
      probe({ name: "service_rest_articles", ok: true, status: 200 }),
      probe({ name: "service_storage_bucket", ok: true, status: 200 }),
      probe({ name: "service_storage_list", ok: true, status: 200 }),
    ]))).toMatchObject({
      ok: true,
      readyForDbExport: true,
      readyForStorageCopy: true,
      phase: "ready_for_safe_migration",
    });
  });
});
