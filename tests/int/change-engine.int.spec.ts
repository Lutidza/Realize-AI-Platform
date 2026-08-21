/**
 * @file tests/int/change-engine.int.spec.ts
 * @version 2026-08-21
 * @description Verifies plan, scope policy and cryptographic execution bindings.
 */

import {
  ChangePlanError,
  assessExecutionScope,
  createExecutionCapability,
  createImplementationAcceptanceBinding,
  createPlanApprovalBinding,
  createPreviewAcceptanceBinding,
  deriveChangePlan,
  issueExecutionCapability,
  PREVIEW_REQUIRED_CHECKS,
  READ_ONLY_CAPABILITIES,
  verifyExecutionCapability,
} from "@realize/change-engine";
import { describe, expect, it } from "vitest";

describe("approval-only Change Engine", () => {
  it("derives a bounded R3 code plan from exact repository paths", () => {
    const plan = deriveChangePlan({
      originalRequest: "Сделай чат доступным во всей админке",
      plan: [
        "Изменить packages/payload-ai-plugin/src/admin/RealizeAIProvider.tsx.",
        "Обновить tests/e2e/admin-ai-chat.e2e.spec.ts.",
        "Проверки: npm run typecheck и npm run test:e2e.",
      ].join("\n"),
    });

    expect(plan.type).toBe("CODE_CHANGE");
    expect(plan.riskLevel).toBe("R3");
    expect(plan.affectedPaths).toEqual([
      "packages/payload-ai-plugin/src/admin/RealizeAIProvider.tsx",
      "tests/e2e/admin-ai-chat.e2e.spec.ts",
    ]);
    expect(plan.checks).toContain("npm run test:e2e");
    expect(plan.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.scopeHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects plans without exact scope and binds every approval field", () => {
    expect(() =>
      deriveChangePlan({
        originalRequest: "Улучши интерфейс",
        plan: "Сделаем интерфейс лучше, современнее и удобнее для пользователя.",
      }),
    ).toThrow(ChangePlanError);

    const first = createPlanApprovalBinding({
      actorID: "7",
      actorRoles: ["admin"],
      changeRequestID: "42",
      decision: "approved",
      expiresAt: "2026-08-19T00:00:00.000Z",
      planHash: "plan-a",
      scopeHash: "scope-a",
      version: 1,
    });
    const changed = createPlanApprovalBinding({
      actorID: "7",
      actorRoles: ["admin"],
      changeRequestID: "42",
      decision: "approved",
      expiresAt: "2026-08-19T00:00:00.000Z",
      planHash: "plan-b",
      scopeHash: "scope-a",
      version: 1,
    });
    expect(first).not.toBe(changed);
    expect(READ_ONLY_CAPABILITIES.approvePlan).toBe(true);
    expect(READ_ONLY_CAPABILITIES.changeCode).toBe(false);
  });
});

describe("isolated execution policy", () => {
  it("allows bounded app code and rejects protected platform owners", () => {
    expect(
      assessExecutionScope({
        affectedPaths: ["src/components/Header/index.tsx"],
        checks: ["npm run typecheck"],
        type: "CODE_CHANGE",
      }),
    ).toEqual({ allowed: true });
    expect(
      assessExecutionScope({
        affectedPaths: ["packages/payload-ai-plugin/src/index.ts"],
        checks: ["npm run typecheck"],
        type: "CODE_CHANGE",
      }),
    ).toEqual(
      expect.objectContaining({
        allowed: false,
        reason: expect.stringContaining("Защищённый owner-layer"),
      }),
    );
    expect(
      assessExecutionScope({
        affectedPaths: ["src/components/Header/index.tsx"],
        checks: ["rm -rf ."],
        type: "CODE_CHANGE",
      }),
    ).toEqual(
      expect.objectContaining({
        allowed: false,
        reason: expect.stringContaining("server allowlist"),
      }),
    );
  });

  it("expires and detects tampering in a job-bound capability", () => {
    const secret = "execution-test-secret-that-is-at-least-32-bytes";
    const claims = createExecutionCapability({
      allowedPaths: ["src/components/Header/index.tsx"],
      baseCommit: "a".repeat(40),
      changeRequestID: "42",
      checks: ["npm run typecheck"],
      executionKey: "execution-42",
      planHash: "b".repeat(64),
      scopeHash: "c".repeat(64),
      ttlSeconds: 3_600,
      version: 1,
    });
    const issued = issueExecutionCapability(claims, secret);
    expect(
      verifyExecutionCapability({
        claims,
        expectedTokenHash: issued.tokenHash,
        secret,
      }),
    ).toBe(true);
    expect(
      verifyExecutionCapability({
        claims: { ...claims, baseCommit: "d".repeat(40) },
        expectedTokenHash: issued.tokenHash,
        secret,
      }),
    ).toBe(false);
    expect(
      verifyExecutionCapability({
        claims,
        expectedTokenHash: issued.tokenHash,
        now: new Date("2999-01-01T00:00:00.000Z"),
        secret,
      }),
    ).toBe(false);

    const accepted = createImplementationAcceptanceBinding({
      actorID: "7",
      actorRoles: ["admin"],
      changeRequestID: "42",
      decision: "approved",
      diffHash: "d".repeat(64),
      evidenceHash: "e".repeat(64),
      expiresAt: "2099-01-01T00:00:00.000Z",
      planHash: "b".repeat(64),
      scopeHash: "c".repeat(64),
      version: 7,
    });
    const otherDiff = createImplementationAcceptanceBinding({
      actorID: "7",
      actorRoles: ["admin"],
      changeRequestID: "42",
      decision: "approved",
      diffHash: "f".repeat(64),
      evidenceHash: "e".repeat(64),
      expiresAt: "2099-01-01T00:00:00.000Z",
      planHash: "b".repeat(64),
      scopeHash: "c".repeat(64),
      version: 7,
    });
    expect(accepted).not.toBe(otherDiff);

    const previewAccepted = createPreviewAcceptanceBinding({
      actorID: "7",
      actorRoles: ["admin"],
      artifactHash: "1".repeat(64),
      changeRequestID: "42",
      commitSHA: "2".repeat(40),
      decision: "approved",
      environment: "local-preview",
      evidenceHash: "3".repeat(64),
      expiresAt: "2099-01-01T00:00:00.000Z",
      reviewerEvidenceHash: "4".repeat(64),
      sourceDiffHash: "d".repeat(64),
      version: 15,
    });
    const otherArtifact = createPreviewAcceptanceBinding({
      actorID: "7",
      actorRoles: ["admin"],
      artifactHash: "5".repeat(64),
      changeRequestID: "42",
      commitSHA: "2".repeat(40),
      decision: "approved",
      environment: "local-preview",
      evidenceHash: "3".repeat(64),
      expiresAt: "2099-01-01T00:00:00.000Z",
      reviewerEvidenceHash: "4".repeat(64),
      sourceDiffHash: "d".repeat(64),
      version: 15,
    });
    expect(previewAccepted).not.toBe(otherArtifact);
    expect(PREVIEW_REQUIRED_CHECKS).toContain("npm run build");
  });
});
