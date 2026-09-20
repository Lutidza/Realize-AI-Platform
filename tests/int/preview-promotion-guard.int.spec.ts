// @vitest-environment node
/**
 * @file tests/int/preview-promotion-guard.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Проверяет неизменность принятого artifact, разрешения и срока повторного preview.
 */
import { describe, expect, it } from "vitest";
import { previewPromotionReason } from "../../packages/payload-ai-plugin/src/endpoints/previewPromotionGuard";
import { previewPromotionFixture } from "./fixtures/previewPromotion";

describe("preview promotion eligibility", () => {
  it("разрешает новый preview и retry с первоначальной версией approval", () => {
    const records = previewPromotionFixture();
    expect(previewPromotionReason(records)).toBeUndefined();
    expect(
      previewPromotionReason({
        ...records,
        deployment: undefined,
        change: { ...records.change, state: "changes_accepted", version: 8 },
      }),
    ).toBeUndefined();
  });

  it.each(["blocked", "rejected", "accepted", "ready", "queued", "expired"])(
    "не повторяет deployment со статусом %s",
    (status) => {
      const records = previewPromotionFixture();
      records.deployment.status = status;
      expect(previewPromotionReason(records)).toBeTruthy();
    },
  );

  it.each(["active", "pending"])(
    "ждёт cleanup при runtime %s",
    (runtimeState) => {
      const records = previewPromotionFixture();
      records.deployment.runtimeState = runtimeState;
      expect(previewPromotionReason(records)).toBeTruthy();
    },
  );

  it("допускает новый runtime после истечения старого при действующем approval", () => {
    const records = previewPromotionFixture();
    records.deployment.expiresAt = "2000-01-01T00:00:00Z";
    expect(previewPromotionReason(records)).toBeUndefined();
  });

  it.each(["approved", "rejected"])(
    "не обходит %s preview decision",
    (decision) => {
      expect(
        previewPromotionReason({
          ...previewPromotionFixture(),
          previewAcceptance: { id: 8, decision },
        }),
      ).toBeTruthy();
    },
  );

  it.each(["", "invalid", "2000-01-01T00:00:00Z"])(
    "отклоняет недействительную дату %s",
    (date) => {
      for (const [record, field] of [
        ["job", "artifactsExpireAt"],
        ["acceptance", "expiresAt"],
      ] as const) {
        const records = previewPromotionFixture();
        records[record][field] = date;
        expect(previewPromotionReason(records)).toBeTruthy();
      }
    },
  );

  it.each([
    "18:14:IMPLEMENTATION_ACCEPTANCE",
    "18:07:IMPLEMENTATION_ACCEPTANCE",
    "18:0:IMPLEMENTATION_ACCEPTANCE",
    "19:7:IMPLEMENTATION_ACCEPTANCE",
    "",
    "18:7:PREVIEW_ACCEPTANCE",
  ])("проверяет исходную версию и scope decisionKey %s", (decisionKey) => {
    const records = previewPromotionFixture();
    records.acceptance.decisionKey = decisionKey;
    expect(previewPromotionReason(records)).toBeTruthy();
  });

  it.each([
    "executionJob",
    "baseCommit",
    "sourceDiffHash",
    "sourceEvidenceHash",
    "boundImplementationHash",
    "changeRequest",
  ])("блокирует смену %s между попытками", (field) => {
    const records = previewPromotionFixture();
    records.deployment[field] = "changed";
    expect(previewPromotionReason(records)).toBeTruthy();
  });

  it.each(["planHash", "scopeHash"])(
    "проверяет approval binding %s",
    (field) => {
      const records = previewPromotionFixture();
      records.change[field] = "changed";
      expect(previewPromotionReason(records)).toBeTruthy();
    },
  );
});
