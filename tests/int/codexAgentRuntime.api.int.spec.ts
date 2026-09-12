// @vitest-environment node

/**
 * @file tests/int/codexAgentRuntime.api.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Проверяет свежие настройки интеграции на зарегистрированных runtime endpoints без запроса к модели.
 */

import { randomBytes, randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODEX_AGENT_SETTINGS_DEFAULTS,
  CODEX_CHAT_SETTINGS_DEFAULTS,
} from "@realize/ai-contracts";
import { createAIEndpoints } from "../../packages/payload-ai-plugin/src/endpoints";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";
import { resolveCodexRuntimeOptions } from "../../packages/payload-ai-plugin/src/integrations/codex/resolveCodexRuntimeOptions.service";
import { encryptIntegrationCredential } from "../../packages/payload-ai-plugin/src/integrations/credentialVault";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";

const mocks = vi.hoisted(() => ({
  message: vi.fn(),
  workflow: vi.fn(),
  health: vi.fn(),
  cancel: vi.fn(),
  projectFiles: vi.fn(),
  capabilities: vi.fn(),
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/chat-context/createChatMessage.service",
  () => ({ createChatMessage: mocks.message }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/chat-context/continueWorkflow.service",
  () => ({ continueWorkflow: mocks.workflow }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/runtime/getControlPlaneClient",
  () => ({
    getControlPlaneClient: () => ({
      health: mocks.health,
      cancelRun: mocks.cancel,
      projectFiles: mocks.projectFiles,
      chatCapabilities: mocks.capabilities,
    }),
  }),
);

const keyEnv = "REALIZE_TEST_AGENT_RUNTIME_KEY";
const key = randomBytes(32).toString("base64");
const options = sanitizeOptions({
  enabled: false,
  runtime: {
    mode: "local-development",
    controlPlaneTokenEnv: "REALIZE_TEST_CP_TOKEN",
    controlPlaneURL: "http://127.0.0.1:3101",
    model: "obsolete-environment-model",
  },
  integrations: { encryptionKeyEnv: keyEnv },
  access: {
    canUseChat: () => true,
    canViewRuns: () => true,
    canManageIntegrations: () => true,
    canManageAIConfiguration: () => true,
    canManageData: () => true,
    canApproveRelease: () => true,
  },
});

/** Только primary Codex меняется между запросами; factories и базовые options остаются прежними. */
const fixture = () => {
  let stored: AIDocument | undefined = {
    id: 1,
    provider: "codex",
    connectionKey: "codex:primary",
    revision: 1,
    displayName: "Тестовый Codex",
    lastTestStatus: "never",
    updatedAt: "2026-09-11T00:00:00.000Z",
    enabled: true,
    configuration: {
      authMode: "apiKey",
      agent: {
        ...CODEX_AGENT_SETTINGS_DEFAULTS,
        model: "current-integration-model",
      },
    },
    credentialEnvelope: encryptIntegrationCredential({
      binding: { provider: "codex", connectionKey: "codex:primary" },
      encryptionKey: key,
      plaintext: JSON.stringify({
        auth_mode: "apikey",
        OPENAI_API_KEY: "synthetic-runtime-key-123456789",
      }),
    }),
  };
  const payload = {
    db: { defaultIDType: "number" },
    logger: { error: vi.fn() },
    find: vi.fn(
      async ({
        collection,
        where,
      }: {
        collection: string;
        where?: Record<string, unknown>;
      }) => {
        const docs =
          collection === "realize-ai-integrations" &&
          stored &&
          (!(where?.connectionKey && typeof where.connectionKey === "object") ||
            (where.connectionKey as { equals?: string }).equals ===
              "codex:primary")
            ? [stored]
            : collection === "realize-ai-runs"
              ? [
                  {
                    id: 7,
                    requestedBy: "actor",
                    conversation: 9,
                    status: "running",
                  },
                ]
              : collection === "realize-ai-conversations" && where?.and
                ? [{ id: 9, createdBy: "actor" }]
                : [];
        return { docs, totalDocs: docs.length };
      },
    ),
    findByID: vi.fn(async () => ({
      id: 7,
      requestedBy: "actor",
      status: "running",
    })),
    create: vi.fn(),
    update: vi.fn(),
  };
  const req = (body: unknown = {}) =>
    ({
      payload,
      user: { id: "actor" },
      headers: new Headers({ "idempotency-key": randomUUID() }),
      routeParams: { id: "7" },
      url: "http://localhost/api/realize-ai/status",
      json: vi.fn(async () => body),
    }) as unknown as PayloadRequest;
  const endpoints = createAIEndpoints(options);
  const call = (
    path: string,
    method: "get" | "post" = "get",
    body?: unknown,
  ) => {
    const endpoint = endpoints.find(
      (item) => item.path === `/realize-ai${path}` && item.method === method,
    );
    if (!endpoint) throw new Error(`Missing endpoint ${method} ${path}`);
    return endpoint.handler(req(body));
  };
  return {
    req,
    call,
    payload,
    stored: () => stored,
    replace: (value: AIDocument | undefined) => {
      stored = value;
    },
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(keyEnv, key);
  mocks.health.mockResolvedValue(true);
  mocks.message.mockResolvedValue({
    message: { id: "message" },
    run: { id: "run" },
  });
  mocks.workflow.mockResolvedValue({ id: "workflow" });
  mocks.cancel.mockResolvedValue({ accepted: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("Current Codex agent runtime", () => {
  it("включение и выключение отражаются без пересоздания endpoint и запрещают новый dispatch", async () => {
    const state = fixture();
    expect((await (await state.call("/status")).json()).data).toMatchObject({
      enabled: true,
      state: "ready",
    });
    expect(
      (
        await state.call("/conversations/:id/messages", "post", {
          content: "Собственный тест",
        })
      ).status,
    ).toBe(202);
    expect(mocks.message.mock.calls[0][1]).toMatchObject({
      enabled: true,
      runtime: { model: "current-integration-model" },
      execution: { enabled: false },
      preview: { enabled: false },
    });
    state.replace({ ...state.stored()!, enabled: false });
    expect((await (await state.call("/status")).json()).data).toMatchObject({
      enabled: false,
      state: "disabled",
    });
    expect(
      (
        await state.call("/conversations/:id/messages", "post", {
          content: "Не отправлять",
        })
      ).status,
    ).toBe(409);
    expect(
      (await state.call("/runs/:id/workflow/continue", "post", {})).status,
    ).toBe(409);
    expect(mocks.message).toHaveBeenCalledTimes(1);
    expect(mocks.workflow).not.toHaveBeenCalled();
    state.replace({ ...state.stored()!, enabled: true });
    expect((await (await state.call("/status")).json()).data.state).toBe(
      "ready",
    );
    expect(options.enabled).toBe(false);
    expect(options.runtime.model).toBe("obsolete-environment-model");
  });

  it.each(["missing", "credential", "malformed", "vault"])(
    "здоровый Control Plane не заменяет готовую интеграцию: %s",
    async (failure) => {
      const state = fixture();
      if (failure === "missing") state.replace(undefined);
      if (failure === "credential")
        state.replace({ ...state.stored()!, credentialEnvelope: null });
      if (failure === "malformed")
        state.replace({
          ...state.stored()!,
          configuration: { authMode: "apiKey", agent: { model: "incomplete" } },
        });
      if (failure === "vault") vi.stubEnv(keyEnv, "");
      expect((await (await state.call("/status")).json()).data.state).toBe(
        "unavailable",
      );
      expect(mocks.health).not.toHaveBeenCalled();
      expect(
        (
          await state.call("/conversations/:id/messages", "post", {
            content: "Не отправлять",
          })
        ).status,
      ).toBe(409);
      expect(mocks.message).not.toHaveBeenCalled();
      expect((await state.call("/conversations")).status).toBe(200);
    },
  );

  it("off сохраняет историю и отмену, но закрывает контекст и новые операции", async () => {
    const state = fixture();
    state.replace({ ...state.stored()!, enabled: false });
    expect((await state.call("/conversations")).status).toBe(200);
    expect((await state.call("/runs/:id/cancel", "post")).status).toBe(202);
    expect(mocks.cancel).toHaveBeenCalledWith("7");
    expect((await state.call("/chat/project-files")).status).toBe(409);
    expect((await state.call("/chat/attachments", "post")).status).toBe(409);
    expect(
      (await state.call("/conversations/:id/data-operations", "post")).status,
    ).toBe(409);
    expect(
      (await state.call("/data-operations/:id/rollback", "post")).status,
    ).toBe(400);
    expect((await state.call("/integrations")).status).toBe(200);
    expect((await (await state.call("/chat/settings")).json()).data).toEqual(
      CODEX_CHAT_SETTINGS_DEFAULTS,
    );
    expect(mocks.projectFiles).not.toHaveBeenCalled();
    expect(state.payload.create).not.toHaveBeenCalled();
  });

  it("current модель и TTL читаются заново и никогда не изменяют переданные options", async () => {
    const state = fixture();
    state.replace({
      ...state.stored()!,
      configuration: {
        authMode: "apiKey",
        agent: {
          ...CODEX_AGENT_SETTINGS_DEFAULTS,
          model: "",
          execution: {
            enabled: true,
            capabilityTTLSeconds: 120,
            artifactsTTLSeconds: 3600,
          },
          preview: { enabled: true, ttlSeconds: 900 },
          release: { enabled: true, ttlSeconds: 3600 },
          sourcePromotion: { enabled: true },
        },
      },
    });
    const current = await resolveCodexRuntimeOptions(state.req(), options);
    expect(current.runtime.model).toBeUndefined();
    expect(current.execution).toMatchObject({
      enabled: true,
      capabilityTTLSeconds: 120,
      artifactsTTLSeconds: 3600,
    });
    expect(current.preview).toEqual({ enabled: true, ttlSeconds: 900 });
    expect(current.release).toEqual({ enabled: true, ttlSeconds: 3600 });
    expect(current.sourcePromotion.enabled).toBe(true);
    expect(options.execution.enabled).toBe(false);
    expect(options.execution.capabilityTTLSeconds).toBe(3600);
    state.replace({
      ...state.stored()!,
      configuration: {
        authMode: "apiKey",
        agent: { ...CODEX_AGENT_SETTINGS_DEFAULTS, model: "changed-model" },
      },
    });
    expect(
      (await resolveCodexRuntimeOptions(state.req(), options)).runtime.model,
    ).toBe("changed-model");
  });

  it("изолированный preview/check остаётся без новых действий при включённой интеграции", async () => {
    const state = fixture();
    const current = await resolveCodexRuntimeOptions(state.req(), {
      ...options,
      runtime: { ...options.runtime, isolated: true },
    });
    expect(current.enabled).toBe(false);
    expect(current.runtimeStatus).toMatchObject({
      state: "disabled",
      enabled: false,
    });
    expect(current.runtimeStatus?.reason).toContain("изолированном");
  });

  it("недоступность Control Plane отображается после проверки интеграции", async () => {
    const state = fixture();
    mocks.health.mockResolvedValue(false);
    expect((await (await state.call("/status")).json()).data).toMatchObject({
      enabled: true,
      state: "unavailable",
    });
  });
});
