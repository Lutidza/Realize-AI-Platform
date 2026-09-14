// @vitest-environment node
/**
 * @file tests/int/pageDiscoveryDispatch.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет приватный допуск запуска, свежий thread и ограниченное чтение статуса runtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PayloadRequest } from "payload";
import { createChatMessage } from "../../packages/payload-ai-plugin/src/chat-context/createChatMessage.service";
import { verifyPageDiscoveryGrant } from "../../packages/payload-ai-plugin/src/chat-context/pageDiscoveryGrant.service";
import { AIRepository } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { AIConfigRepository } from "../../packages/payload-ai-plugin/src/endpoints/aiConfigRepository";
import { ControlPlaneClient } from "../../packages/payload-ai-plugin/src/runtime/controlPlaneClient";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";

const mocks = vi.hoisted(() => ({ startRun: vi.fn() }));
vi.mock(
  "../../packages/payload-ai-plugin/src/runtime/getControlPlaneClient",
  () => ({ getControlPlaneClient: () => mocks }),
);
const options = {
  enabled: true,
  userCollection: "users",
  runtime: {
    controlPlaneTokenEnv: "REALIZE_PAGE_DISCOVERY_DISPATCH_TEST_TOKEN",
    model: "test-model",
  },
  pageDraft: { text: {} },
  access: { canManageData: () => true },
} as unknown as SanitizedRealizeAIPluginOptions;
const req = {
  payload: {
    config: { serverURL: "http://localhost:3000", routes: { api: "/api" } },
    db: { defaultIDType: "number" },
  },
  user: { id: 1, collection: "users" },
} as unknown as PayloadRequest;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.stubEnv(
    "REALIZE_PAGE_DISCOVERY_DISPATCH_TEST_TOKEN",
    "private-dispatch-test-key",
  );
  mocks.startRun.mockResolvedValue(undefined);
  vi.spyOn(AIConfigRepository.prototype, "getActivePointer").mockResolvedValue(
    undefined,
  );
  vi.spyOn(AIRepository.prototype, "getConversationDetail").mockResolvedValue({
    conversation: { id: 2, status: "active" },
    runs: [],
    messages: [{ id: 10, role: "user", content: "Найди доставку" }],
  });
  vi.spyOn(AIRepository.prototype, "findRunByIdempotencyKey").mockResolvedValue(
    undefined,
  );
  vi.spyOn(AIRepository.prototype, "getLatestThreadID").mockResolvedValue(
    "old-thread-with-other-tools",
  );
  vi.spyOn(AIRepository.prototype, "createRun").mockImplementation(
    async (input) => ({ id: 7, status: "queued", ...input }),
  );
  vi.spyOn(AIRepository.prototype, "createUserMessage").mockImplementation(
    async (input) => ({ id: 11, role: "user", kind: "user_message", ...input }),
  );
  vi.spyOn(AIRepository.prototype, "touchConversation").mockResolvedValue(
    undefined,
  );
  vi.spyOn(AIRepository.prototype, "persistEvent").mockResolvedValue(true);
  vi.spyOn(AIRepository.prototype, "updateRun").mockResolvedValue({ id: 7 });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("page discovery chat dispatch", () => {
  it("starts a fresh thread with a private grant and bounded history without public credential leakage", async () => {
    const result = await createChatMessage(req, options, 1, "2", "new-run", {
      content: "Найди страницу доставки",
    });
    const dispatched = mocks.startRun.mock.calls[0][0];
    expect(dispatched.threadID).toBeUndefined();
    expect(dispatched.conversationHistory).toContain("Найди доставку");
    expect(AIRepository.prototype.getLatestThreadID).not.toHaveBeenCalled();
    expect(
      verifyPageDiscoveryGrant(dispatched.pageDiscovery.token, "7", options)
        .userID,
    ).toBe("1");
    expect(JSON.stringify(result)).not.toContain(
      dispatched.pageDiscovery.token,
    );
    const stored = vi.mocked(AIRepository.prototype.createRun).mock.calls[0][0];
    expect(stored.turnContext?.pageDiscoveryEnabled).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(
      dispatched.pageDiscovery.token,
    );
    expect(JSON.stringify(dispatched.prompt)).not.toContain(
      dispatched.pageDiscovery.token,
    );
  });
  it.each(["disabled", "denied", "no_adapter"])(
    "does not offer tools outside the existing page permission: %s",
    async (mode) => {
      const unavailable = {
        ...options,
        enabled: mode !== "disabled",
        pageDraft: mode === "no_adapter" ? undefined : options.pageDraft,
        access: { ...options.access, canManageData: () => mode !== "denied" },
      };
      await createChatMessage(req, unavailable, 1, "2", "legacy-run", {
        content: "Обсудим страницу",
      });
      expect(mocks.startRun.mock.calls[0][0].pageDiscovery).toBeUndefined();
      expect(mocks.startRun.mock.calls[0][0].threadID).toBe(
        "old-thread-with-other-tools",
      );
    },
  );
  it("keeps accepted-message replay stable after the integration permission changes", async () => {
    await createChatMessage(req, options, 1, "2", "same-request", {
      content: "Найди доставку",
    });
    const saved = vi.mocked(AIRepository.prototype.createRun).mock.calls[0][0];
    vi.mocked(AIRepository.prototype.findRunByIdempotencyKey).mockResolvedValue(
      { id: 7, status: "queued", ...saved },
    );
    mocks.startRun.mockClear();
    await createChatMessage(
      req,
      { ...options, enabled: false },
      1,
      "2",
      "same-request",
      { content: "Найди доставку" },
    );
    expect(mocks.startRun).not.toHaveBeenCalled();
  });
});

describe("page discovery live run status", () => {
  it("reads only the expected run status through the authenticated existing endpoint", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ run: { id: "7", status: "running" } }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      new ControlPlaneClient(
        "http://localhost:3100",
        "test-runtime-token",
      ).runStatus("7"),
    ).resolves.toBe("running");
    expect(fetch).toHaveBeenCalledWith(
      new URL("http://localhost:3100/v1/runs/7"),
      expect.objectContaining({
        headers: { Authorization: "Bearer test-runtime-token" },
        cache: "no-store",
      }),
    );
  });
  it.each([
    { run: { id: "other-run", status: "running" } },
    { run: { id: "7", status: "unknown" } },
    null,
    { run: { id: "7", status: "running", extra: "x".repeat(9_000) } },
  ])(
    "rejects a malformed, foreign or oversized status response",
    async (response) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(response)),
      );
      await expect(
        new ControlPlaneClient(
          "http://localhost:3100",
          "test-runtime-token",
        ).runStatus("7"),
      ).rejects.toThrow("Invalid control-plane run status");
    },
  );
});
