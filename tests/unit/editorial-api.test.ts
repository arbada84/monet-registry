import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  applyTrustedEditorialSourceRights: vi.fn(),
  createEditorialCandidateFromPackage: vi.fn(),
  updateEditorialSourceRights: vi.fn(),
  decideEditorialCorrection: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/editorial/repository", () => ({
  applyTrustedEditorialSourceRights: mocks.applyTrustedEditorialSourceRights,
  createEditorialCandidateFromPackage: mocks.createEditorialCandidateFromPackage,
  getEditorialRuntimeState: vi.fn(),
  listEditorialCandidates: vi.fn(),
  updateEditorialSourceRights: mocks.updateEditorialSourceRights,
  decideEditorialCorrection: mocks.decideEditorialCorrection,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

function packageBody() {
  return {
    schemaVersion: 1,
    candidateId: "candidate-api",
    title: "권리 위조 입력",
    state: "collected",
    articleType: "CP-0",
    sources: [{
      id: "source-api",
      sourceType: "external",
      sourceName: "제출 출처",
      sourceUrl: "https://example.com/article",
      title: "제출 자료",
      body: "제출자가 권리를 주장한 본문",
      fixture: false,
      usageBasis: "licensed",
      allowedUses: ["evidence"],
      rightsGrade: "A",
      evidenceEligible: true,
      trainingEligible: true,
    }],
    claims: [],
    evidence: [],
    humanReviewRequired: true,
    autoPublishAllowed: false,
  };
}

async function adminCookie(role: "reporter" | "editor" | "superadmin") {
  const { generateAuthToken } = await import("@/lib/cookie-auth");
  return `cp-admin-auth=${await generateAuthToken(role, role)}`;
}

describe("editorial API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COOKIE_SECRET = "editorial-api-test-cookie-secret-longer-than-32";
  });

  it("applies server-trusted source rights before evaluating a submitted package", async () => {
    const submitted = packageBody();
    const trusted = {
      ...submitted,
      sources: [{
        ...submitted.sources[0],
        usageBasis: "unconfirmed",
        rightsGrade: "D",
        allowedUses: [],
        evidenceEligible: false,
        trainingEligible: false,
      }],
    };
    mocks.applyTrustedEditorialSourceRights.mockResolvedValue(trusted);
    mocks.createEditorialCandidateFromPackage.mockResolvedValue({ candidate: { id: "candidate-api" } });
    const { POST } = await import("@/app/api/editorial/candidates/route");
    const response = await POST(new NextRequest("https://culturepeople.co.kr/api/editorial/candidates", {
      method: "POST",
      headers: {
        cookie: await adminCookie("reporter"),
        origin: "https://culturepeople.co.kr",
        host: "culturepeople.co.kr",
        "content-type": "application/json",
        "idempotency-key": "candidate-api-0001",
      },
      body: JSON.stringify(submitted),
    }));
    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.gate.nextState).toBe("blocked_rights");
    expect(mocks.applyTrustedEditorialSourceRights).toHaveBeenCalledOnce();
    expect(mocks.createEditorialCandidateFromPackage.mock.calls[0][0].package.sources[0].evidenceEligible).toBe(false);
  });

  it("allows only superadmin to change source rights", async () => {
    const { PATCH } = await import("@/app/api/editorial/sources/[id]/rights/route");
    const request = async (role: "reporter" | "superadmin") => PATCH(
      new NextRequest("https://culturepeople.co.kr/api/editorial/sources/source-api/rights", {
        method: "PATCH",
        headers: {
          cookie: await adminCookie(role),
          origin: "https://culturepeople.co.kr",
          host: "culturepeople.co.kr",
          "content-type": "application/json",
          "idempotency-key": `source-rights-${role}`,
        },
        body: JSON.stringify({
          generation: 0,
          usageBasis: "licensed",
          rightsGrade: "B",
          allowedUses: ["evidence"],
          evidenceEligible: true,
          trainingEligible: false,
        }),
      }),
      { params: Promise.resolve({ id: "source-api" }) },
    );
    expect((await request("reporter")).status).toBe(403);
    mocks.updateEditorialSourceRights.mockResolvedValue({ id: "source-api", rights_grade: "B" });
    expect((await request("superadmin")).status).toBe(200);
    expect(mocks.updateEditorialSourceRights).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "source-api",
      rightsGrade: "B",
      evidenceEligible: true,
      actor: expect.objectContaining({ role: "superadmin" }),
    }));
  });

  it("revalidates public article and RSS only after correction approval", async () => {
    mocks.decideEditorialCorrection.mockResolvedValue({
      candidate: { id: "candidate-api" },
      corrections: [{ id: "correction-1", article_no: 401 }],
    });
    const { PATCH } = await import("@/app/api/editorial/candidates/[id]/corrections/[correctionId]/route");
    const request = async (status: "approved" | "rejected") => PATCH(
      new NextRequest("https://culturepeople.co.kr/api/editorial/candidates/candidate-api/corrections/correction-1", {
        method: "PATCH",
        headers: {
          cookie: await adminCookie("editor"),
          origin: "https://culturepeople.co.kr",
          host: "culturepeople.co.kr",
          "content-type": "application/json",
          "idempotency-key": `correction-${status}`,
        },
        body: JSON.stringify({ status }),
      }),
      { params: Promise.resolve({ id: "candidate-api", correctionId: "correction-1" }) },
    );
    expect((await request("rejected")).status).toBe(200);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect((await request("approved")).status).toBe(200);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/article/401");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/rss.xml");
  });
});
