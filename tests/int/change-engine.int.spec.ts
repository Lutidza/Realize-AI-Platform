/**
 * @file tests/int/change-engine.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет plan policy и cryptographic execution/release bindings.
 */

import {
  ChangePlanError,
  assessExecutionScope,
  assessReleaseCandidate,
  buildDataOperationProtocolInstructions,
  createExecutionCapability,
  createCategoryAssignmentOperationHash,
  createCategoryAssignmentRollbackHash,
  createDataOperationApprovalBinding,
  createImplementationAcceptanceBinding,
  createPlanApprovalBinding,
  createPreviewAcceptanceBinding,
  createMigrationSetHash,
  createReleaseApprovalBinding,
  createReleaseCandidateKey,
  createReleaseEvidenceHash,
  deriveChangePlan,
  hasDataOperationIntent,
  issueExecutionCapability,
  PREVIEW_REQUIRED_CHECKS,
  READ_ONLY_CAPABILITIES,
  parseDataOperationIntentFromAssistant,
  stripDataOperationProtocol,
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

describe("typed Payload Data Lane policy", () => {
  it("hands textual confirmation back to the hash-bound Payload controls", () => {
    const instructions = buildDataOperationProtocolInstructions();

    expect(instructions).toContain(
      "The read-only restriction applies to you, not to the governed Payload Data Lane executor",
    );
    expect(instructions).toContain(
      'A chat message such as "подтверждаю", "приступай", or "применяй" is not a hash-bound approval',
    );
    expect(instructions).toContain(
      'click "Шаг 1 · Подготовить изменение данных"',
    );
    expect(instructions).toContain('click "Шаг 2 · Подтвердить vN"');
    expect(instructions).toContain('click "Шаг 3 · Применить"');
  });

  it("parses one narrow assistant proposal and hides its machine block", () => {
    const response = [
      "Добавлю существующую категорию к одному товару после dry-run.",
      "```realize-data-operation",
      JSON.stringify({
        category: { slug: "accessories" },
        kind: "catalog.assignCategory.v1",
        product: { slug: "classic-watch" },
        version: "1.0",
      }),
      "```",
    ].join("\n");

    expect(parseDataOperationIntentFromAssistant(response)).toEqual({
      category: { slug: "accessories" },
      kind: "catalog.assignCategory.v1",
      product: { slug: "classic-watch" },
      version: "1.0",
    });
    expect(hasDataOperationIntent(response)).toBe(true);
    expect(stripDataOperationProtocol(response)).toBe(
      "Добавлю существующую категорию к одному товару после dry-run.",
    );
    expect(() =>
      parseDataOperationIntentFromAssistant(`${response}\n${response}`),
    ).toThrow("несколько Data Operation blocks");
  });

  it("binds operation, rollback and approval to every stale-sensitive field", () => {
    const dryRun = {
      afterCategoryIDs: ["10", "11"],
      beforeCategoryIDs: ["10"],
      categoryID: "11",
      expectedTargetUpdatedAt: "2026-08-28T00:00:00.000Z",
      productID: "7",
    };
    const operationHash = createCategoryAssignmentOperationHash(dryRun);
    const changedVersion = createCategoryAssignmentOperationHash({
      ...dryRun,
      expectedTargetUpdatedAt: "2026-08-28T00:00:01.000Z",
    });
    expect(operationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(operationHash).not.toBe(changedVersion);

    const rollbackHash = createCategoryAssignmentRollbackHash({
      afterCategoryIDs: dryRun.afterCategoryIDs,
      beforeCategoryIDs: dryRun.beforeCategoryIDs,
      operationHash,
      productID: dryRun.productID,
    });
    expect(rollbackHash).toMatch(/^[a-f0-9]{64}$/);
    const approval = createDataOperationApprovalBinding({
      actorID: "1",
      actorRoles: ["admin"],
      approvalType: "WRITE_CONFIRMATION",
      dataOperationID: "4",
      decision: "approved",
      expiresAt: "2026-08-29T00:00:00.000Z",
      targetHash: operationHash,
      version: 1,
    });
    expect(approval).not.toBe(
      createDataOperationApprovalBinding({
        actorID: "1",
        actorRoles: ["admin"],
        approvalType: "WRITE_CONFIRMATION",
        dataOperationID: "4",
        decision: "approved",
        expiresAt: "2026-08-29T00:00:00.000Z",
        targetHash: changedVersion,
        version: 1,
      }),
    );
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
        affectedPaths: [
          "packages/payload-ai-plugin/src/realizeAIPlugin.plugin.ts",
        ],
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

  it("rejects unsigned OCI evidence and binds release approval to exact digest", () => {
    const migrations = [
      {
        checksum: "7".repeat(64),
        direction: "up" as const,
        id: "20260822_release_candidate",
      },
    ];
    const migrationSetHash = createMigrationSetHash(migrations);
    const evidence = {
      configVersion: "payload-config-v1",
      evidenceHash: "8".repeat(64),
      gitCommit: "9".repeat(40),
      imageDigest: `sha256:${"a".repeat(64)}`,
      imageRef: `ghcr.io/realize/app@sha256:${"a".repeat(64)}`,
      manifestHash: "b".repeat(64),
      migrationSetHash,
      migrations,
      pluginVersions: { payload: "3.88.0" },
      previewStatus: "healthy",
      previewURL: "https://preview.example.test",
      provenanceRef: "oci://provenance/ref",
      sbomDigest: `sha256:${"c".repeat(64)}`,
      signatureRef: "oci://signature/ref",
      signatureVerified: true,
    };

    expect(assessReleaseCandidate(evidence)).toEqual({ allowed: true });
    expect(
      assessReleaseCandidate({ ...evidence, signatureVerified: false }),
    ).toEqual(
      expect.objectContaining({
        allowed: false,
        reason: expect.stringContaining("signature"),
      }),
    );
    expect(
      assessReleaseCandidate({
        ...evidence,
        imageRef: `not-an-oci-name@${evidence.imageDigest}`,
      }),
    ).toEqual(
      expect.objectContaining({
        allowed: false,
        reason: expect.stringContaining("reference"),
      }),
    );
    expect(assessReleaseCandidate({ ...evidence, pluginVersions: {} })).toEqual(
      expect.objectContaining({
        allowed: false,
        reason: expect.stringContaining("plugin versions"),
      }),
    );

    const accepted = createReleaseApprovalBinding({
      actorID: "7",
      actorRoles: ["admin"],
      changeRequestID: "42",
      decision: "approved",
      environment: "production",
      evidenceHash: evidence.evidenceHash,
      expiresAt: "2099-01-01T00:00:00.000Z",
      gitCommit: evidence.gitCommit,
      imageDigest: evidence.imageDigest,
      manifestHash: evidence.manifestHash,
      migrationSetHash,
      sbomDigest: evidence.sbomDigest,
      signatureRef: evidence.signatureRef,
      version: 18,
    });
    const rebuilt = createReleaseApprovalBinding({
      actorID: "7",
      actorRoles: ["admin"],
      changeRequestID: "42",
      decision: "approved",
      environment: "production",
      evidenceHash: evidence.evidenceHash,
      expiresAt: "2099-01-01T00:00:00.000Z",
      gitCommit: evidence.gitCommit,
      imageDigest: `sha256:${"d".repeat(64)}`,
      manifestHash: evidence.manifestHash,
      migrationSetHash,
      sbomDigest: evidence.sbomDigest,
      signatureRef: evidence.signatureRef,
      version: 18,
    });
    expect(accepted).not.toBe(rebuilt);
  });

  it("derives one idempotent candidate key from exact preview evidence", () => {
    const input = {
      changeRequestID: "12",
      sourceAcceptanceHash: "a".repeat(64),
      sourcePreviewArtifactHash: "b".repeat(64),
      sourcePreviewEvidenceHash: "c".repeat(64),
    };

    expect(createReleaseCandidateKey(input)).toBe(
      createReleaseCandidateKey(input),
    );
    expect(
      createReleaseCandidateKey({
        ...input,
        sourcePreviewEvidenceHash: "d".repeat(64),
      }),
    ).not.toBe(createReleaseCandidateKey(input));
  });

  it("canonicalizes plugin order in the release evidence hash", () => {
    const evidence = {
      candidateKey: "candidate-key",
      configVersion: "payload-config-v1",
      gitCommit: "a".repeat(40),
      healthSummary: "Readiness passed.",
      imageDigest: `sha256:${"b".repeat(64)}`,
      imageRef: `ghcr.io/realize/app@sha256:${"b".repeat(64)}`,
      manifestHash: "c".repeat(64),
      migrationSetHash: createMigrationSetHash([]),
      migrations: [],
      pluginVersions: { payload: "3.88.0", seo: "3.88.0" },
      previewStatus: "healthy" as const,
      previewURL: "https://preview.example.test",
      provenanceRef: "oci://provenance/ref",
      sbomDigest: `sha256:${"d".repeat(64)}`,
      signatureRef: "oci://signature/ref",
      signatureVerified: true as const,
      sourceAcceptanceHash: "e".repeat(64),
      sourcePreviewArtifactHash: "f".repeat(64),
      sourcePreviewEvidenceHash: "1".repeat(64),
    };

    expect(createReleaseEvidenceHash(evidence)).toBe(
      createReleaseEvidenceHash({
        ...evidence,
        pluginVersions: { seo: "3.88.0", payload: "3.88.0" },
      }),
    );
  });
});
