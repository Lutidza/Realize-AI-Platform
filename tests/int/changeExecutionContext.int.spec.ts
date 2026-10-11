/**
 * @file tests/int/changeExecutionContext.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Проверяет происхождение policy на границе plan → CR без доверия клиентскому телу.
 */
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PayloadRequest } from "payload";
import { SYSTEM_AI_RELEASE_REFERENCE } from "@realize/change-engine";
import { AIRepository } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { readChangeExecutionContext } from "../../packages/payload-ai-plugin/src/endpoints/readChangeExecutionContext.service";
import { createRuntimeConfigurationFixture } from "./fixtures/systemAIRelease.fixture";

afterEach(() => vi.restoreAllMocks());
const req = { payload: { db: { defaultIDType: "number" } } } as PayloadRequest;
const source = { id: 3, runID: "42" };
const run = () => ({
  id: 42,
  conversation: 8,
  status: "completed",
  requestHash: "c".repeat(64),
  turnContext: {
    systemRelease: SYSTEM_AI_RELEASE_REFERENCE,
    agentConfiguration: structuredClone(createRuntimeConfigurationFixture()),
  },
});

describe("Change Request AI context origin", () => {
  it("loads the owned source run and preserves its exact overlay, without an active-pointer lookup", async () => {
    const saved = run();
    const get = vi
      .spyOn(AIRepository.prototype, "getRun")
      .mockResolvedValue(saved);
    const result = await readChangeExecutionContext(
      req,
      source,
      "8",
      7,
      "fixture request",
    );
    expect(get).toHaveBeenCalledWith("42", 7);
    expect(result.agentConfiguration).toEqual(
      saved.turnContext.agentConfiguration,
    );
    expect(result.systemRelease).toEqual(SYSTEM_AI_RELEASE_REFERENCE);
    expect(result.inputContextHash).toMatch(/^[a-f0-9]{64}$/);
    saved.turnContext.agentConfiguration.compiled.profile.title =
      "changed after CR creation";
    expect(result.agentConfiguration?.compiled.profile.title).not.toBe(
      saved.turnContext.agentConfiguration.compiled.profile.title,
    );
  });

  it.each(["wrong-conversation", "unfinished", "legacy", "forged"])(
    "rejects %s source without rebinding latest",
    async (kind) => {
      const saved: Record<string, unknown> & { id: number } = run();
      if (kind === "wrong-conversation") saved.conversation = 9;
      if (kind === "unfinished") saved.status = "running";
      if (kind === "legacy") saved.turnContext = {};
      if (kind === "forged")
        saved.turnContext = {
          systemRelease: { releaseID: "forged", manifestHash: "d".repeat(64) },
        };
      vi.spyOn(AIRepository.prototype, "getRun").mockResolvedValue(saved);
      await expect(
        readChangeExecutionContext(req, source, "8", 7, "fixture request"),
      ).rejects.toMatchObject({ status: 409 });
    },
  );

  it("never bypasses ownership failures from the repository", async () => {
    vi.spyOn(AIRepository.prototype, "getRun").mockRejectedValue(
      new Error("owned run denied"),
    );
    await expect(
      readChangeExecutionContext(req, source, "8", 7, "fixture request"),
    ).rejects.toThrow("owned run denied");
  });
});
