// @vitest-environment node
/**
 * @file tests/int/change-preview-projection.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-17
 * @description Проверяет доступность повторного preview в публичной проекции Change Request.
 */

import { describe, expect, it } from "vitest";

import { projectChangeRequest } from "../../packages/payload-ai-plugin/src/endpoints/changeProjection";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";
import { previewPromotionFixture } from "./fixtures/previewPromotion";

const fixture = () => {
  const records = previewPromotionFixture();
  const input = {
    change: records.change,
    acceptance: records.acceptance,
    options: sanitizeOptions({
      access: {
        canApproveRelease: () => false,
        canManageAIConfiguration: () => false,
        canManageData: () => false,
        canManageIntegrations: () => false,
        canUseChat: () => false,
        canViewRuns: () => false,
      },
      execution: { enabled: true },
      preview: { enabled: true },
      runtime: {
        controlPlaneTokenEnv: "SYNTHETIC_TEST_CONTROL_TOKEN",
        mode: "local-development",
      },
    }),
    deploymentRepository: {
      getLatestDeployment: async () => records.deployment,
      listCheckResults: async () => [],
    },
    executionRepository: {
      getLatestJob: async () => records.job,
      listCheckResults: async () => [],
      readWorkerPresence: async () => ({ readable: true, rows: [] }),
    },
    releaseRepository: { getLatestCandidate: async () => undefined },
    sourcePromotionRepository: { getLatestPromotion: async () => undefined },
  } as unknown as Parameters<typeof projectChangeRequest>[0];
  return { input, records };
};

describe("preview retry projection", () => {
  it("показывает повтор принятого diff вместе с evidence неуспешной попытки", async () => {
    const { input } = fixture();
    const change = await projectChangeRequest(input);
    expect(change.preview).toMatchObject({
      enabled: true,
      deployment: { id: "4", status: "failed", runtimeState: "stopped" },
    });
    expect(change.preview.reason).toBeUndefined();
  });

  it("не предлагает повтор после блокировки reviewer", async () => {
    const { input, records } = fixture();
    records.change.state = "blocked";
    records.deployment.status = "blocked";
    expect((await projectChangeRequest(input)).preview).toMatchObject({
      enabled: false,
      reason: "Promotion заблокирована policy gate.",
    });
  });

  it.each(["execution", "preview"] as const)(
    "учитывает выключенный этап %s",
    async (operation) => {
      const { input } = fixture();
      input.options[operation].enabled = false;
      expect((await projectChangeRequest(input)).preview).toMatchObject({
        enabled: false,
        reason: "Local preview worker отключён конфигурацией.",
      });
    },
  );

  it.each(["approved", "rejected"])(
    "не предлагает повтор после решения %s по preview",
    async (decision) => {
      const { input } = fixture();
      input.previewAcceptance = { id: 8, decision };
      expect((await projectChangeRequest(input)).preview).toMatchObject({
        enabled: false,
        acceptance: { decision },
        reason:
          "Решение по preview уже принято; повтор этой операции недоступен.",
      });
    },
  );
});
