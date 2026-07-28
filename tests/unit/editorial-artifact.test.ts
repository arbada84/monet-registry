import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  auditEvidencePackage,
  buildEvidencePackage,
  readAdapterManifestFile,
  validateAdapterManifest,
} from "../../scripts/lib/editorial-artifact.mjs";
import { evaluateAutomationReadiness, reproduceAnalysis } from "@/lib/editorial/analysis";

describe("editorial offline artifacts", () => {
  it("rejects fixture eligibility and unsafe artifact paths", () => {
    expect(() => validateAdapterManifest({
      schemaVersion: 1,
      records: [{ id: "fixture", sourceName: "harness", evidenceEligible: true }],
    })).toThrow("fixture eligibility rejected");
    expect(() => validateAdapterManifest({
      schemaVersion: 1,
      records: [{ id: "unsafe", artifactPath: "../secret.json" }],
    })).toThrow();
  });

  it("keeps unconfirmed sources blocked in generated evidence packages", () => {
    const manifest = validateAdapterManifest({
      schemaVersion: 1,
      records: [{
        id: "source-1",
        title: "확인 전 자료",
        body: "이 문장은 충분히 길지만 사용 권리는 아직 확인되지 않았다.",
        usageBasis: "unconfirmed",
        evidenceEligible: true,
      }],
    });
    const report = auditEvidencePackage(buildEvidencePackage(manifest));
    expect(report.ok).toBe(false);
    expect(report.state).toBe("blocked_rights");
  });

  it("accepts bounded JSONL records and rejects malformed lines", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "editorial-jsonl-"));
    const valid = path.join(folder, "valid.jsonl");
    const invalid = path.join(folder, "invalid.jsonl");
    fs.writeFileSync(valid, `${JSON.stringify({ id: "one", body: "권리 확인 전 문장입니다.", usageBasis: "unconfirmed" })}\n`, "utf8");
    fs.writeFileSync(invalid, "{\"id\":\"one\"}\nnot-json\n", "utf8");
    expect(readAdapterManifestFile(valid).records).toHaveLength(1);
    expect(() => readAdapterManifestFile(invalid)).toThrow("malformed JSONL at line 2");
  });

  it("marks conflicting numbers from similar independent sentences as counterview work", () => {
    const manifest = validateAdapterManifest({
      schemaVersion: 1,
      records: [
        {
          id: "one",
          sourceName: "source-one",
          sourceUrl: "https://one.example.net/report",
          title: "관객 집계",
          body: "행사 관객은 1200명으로 최종 집계됐다고 밝혔다.",
          usageBasis: "licensed",
          evidenceEligible: true,
        },
        {
          id: "two",
          sourceName: "source-two",
          sourceUrl: "https://two.example.net/report",
          title: "관객 재집계",
          body: "행사 관객은 900명으로 최종 집계됐다고 밝혔다.",
          usageBasis: "licensed",
          evidenceEligible: true,
        },
      ],
    });
    const pkg = buildEvidencePackage(manifest);
    const report = auditEvidencePackage(pkg);
    expect(pkg.evidence.some((item) => item.relation === "contradicting")).toBe(true);
    expect(report.state).toBe("needs_counterview");
    expect(report.contradictingCoreClaims.length).toBeGreaterThan(0);
  });

  it("reproduces analysis values and keeps automation in draft-only mode", () => {
    const rows = [{ value: 2 }, { value: 4 }];
    expect(reproduceAnalysis({
      schemaVersion: 1,
      datasetId: "fixture",
      datasetVersion: "1",
      datasetHash: crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      queryHash: "c".repeat(64),
      codeHash: "d".repeat(64),
      rows,
      calculations: [{ id: "sum", operation: "sum", field: "value", expected: 6 }],
      methodology: "fixture sum",
      limitations: ["합성 자료"],
      chartArtifacts: [],
    }).ok).toBe(true);
    expect(evaluateAutomationReadiness({
      shadowDays: 89,
      pilotCount: 49,
      reviewerCount: 1,
      holdoutEvaluated: false,
      unsupportedCoreClaims: 1,
      highRiskAutoPublished: 0,
      killSwitchVerified: false,
      decisionRecordApproved: false,
    })).toMatchObject({ ready: false, mode: "draft_only", autoPublishEnabled: false });
  });
});
