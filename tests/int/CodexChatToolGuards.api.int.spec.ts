// @vitest-environment node

/**
 * @file tests/int/CodexChatToolGuards.api.int.spec.ts
 * @version 1.1.1
 * @date 2026-09-16
 * @description Проверяет запреты новых операций чата и сохранение отказа, отмены и отката.
 */

import { randomBytes, randomUUID } from "node:crypto";
import {
  CODEX_CHAT_SETTINGS_DEFAULTS,
  CODEX_AGENT_SETTINGS_DEFAULTS,
  type CodexChatSettingsDto,
} from "@realize/ai-contracts";
import type { PayloadRequest } from "payload";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  CONVERSATIONS_SLUG,
  DATA_OPERATIONS_SLUG,
} from "../../packages/payload-ai-plugin/src/constants";
import { createAIEndpoints } from "../../packages/payload-ai-plugin/src/endpoints";
import { requireCodexChatTool } from "../../packages/payload-ai-plugin/src/endpoints/requireCodexChatTool.service";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";

import { encryptIntegrationCredential } from "../../packages/payload-ai-plugin/src/integrations/credentialVault";
const KEY = randomBytes(32).toString("base64");
vi.stubEnv("REALIZE_TEST_CHAT_GUARD_KEY", KEY);
afterAll(() => vi.unstubAllEnvs());
const options = {
  runtime: { mode: "local-development" },
  integrations: { encryptionKeyEnv: "REALIZE_TEST_CHAT_GUARD_KEY" },
  enabled: true,
  access: {
    canUseChat: () => true,
    canManageData: () => true,
    canManageIntegrations: () => true,
    canApproveRelease: () => true,
  },
  execution: { enabled: true },
  preview: { enabled: true },
  release: { enabled: true },
  sourcePromotion: { enabled: true },
} as unknown as SanitizedRealizeAIPluginOptions;

const request = (
  tools: CodexChatSettingsDto["tools"] | null,
  authorized = true,
) => {
  const userID = randomUUID();
  const payload = {
    db: { defaultIDType: "number" },
    logger: { error: vi.fn() },
    // Approve/apply читают существующую операцию и её владельца перед запретом записи.
    find: vi.fn(async ({ collection }: { collection: string }) => ({
      docs:
        collection === DATA_OPERATIONS_SLUG
          ? [
              {
                id: 1,
                conversation: 1,
                kind: "catalog.assignCategory.v1",
                requestedBy: userID,
              },
            ]
          : collection === CONVERSATIONS_SLUG
            ? [{ id: 1, createdBy: userID }]
            : tools
              ? [
                  {
                    id: 1,
                    provider: "codex",
                    enabled: true,
                    credentialEnvelope: encryptIntegrationCredential({
                      binding: {
                        provider: "codex",
                        connectionKey: "codex:primary",
                      },
                      encryptionKey: KEY,
                      plaintext: JSON.stringify({
                        auth_mode: "apikey",
                        OPENAI_API_KEY: "synthetic-guard-api-key-123456",
                      }),
                    }),
                    configuration: {
                      authMode: "apiKey",
                      agent: {
                        ...CODEX_AGENT_SETTINGS_DEFAULTS,
                        execution: {
                          ...CODEX_AGENT_SETTINGS_DEFAULTS.execution,
                          enabled: true,
                        },
                        preview: {
                          ...CODEX_AGENT_SETTINGS_DEFAULTS.preview,
                          enabled: true,
                        },
                        release: {
                          ...CODEX_AGENT_SETTINGS_DEFAULTS.release,
                          enabled: true,
                        },
                        sourcePromotion: { enabled: true },
                      },
                      chat: { ...CODEX_CHAT_SETTINGS_DEFAULTS, tools },
                    },
                  },
                ]
              : [],
      totalDocs:
        collection === DATA_OPERATIONS_SLUG ||
        collection === CONVERSATIONS_SLUG ||
        tools
          ? 1
          : 0,
    })),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const req = {
    headers: new Headers({ "idempotency-key": randomUUID() }),
    routeParams: { id: "1" },
    json: vi.fn(async () => ({})),
    payload,
    user: authorized ? { id: userID } : null,
  } as unknown as PayloadRequest;
  return { req, payload };
};

const endpoints = createAIEndpoints(options);
const call = (path: string, req: PayloadRequest) => {
  const endpoint = endpoints.find((item) => item.path === `/realize-ai${path}`);
  if (!endpoint) throw new Error(`Endpoint ${path} missing.`);
  return endpoint.handler(req);
};

describe("Codex chat tool guards", () => {
  it.each([
    "/conversations/:id/changes",
    "/changes/:id/approve-plan",
    "/changes/:id/execute",
    "/changes/:id/accept-implementation",
    "/changes/:id/deploy-preview",
    "/changes/:id/accept-preview",
    "/changes/:id/prepare-release",
    "/changes/:id/approve-release",
    "/changes/:id/publish-pull-request",
  ])("блокирует %s до чтения команды и побочных эффектов", async (path) => {
    const { req, payload } = request({
      codeChanges: false,
      dataOperations: true,
    });
    const response = await call(path, req);
    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toContain(
      "Изменения кода выключены",
    );
    expect(req.json).not.toHaveBeenCalled();
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });

  it.each([
    "/conversations/:id/data-operations",
    "/data-operations/:id/approve",
    "/data-operations/:id/apply",
  ])("блокирует %s только переключателем данных", async (path) => {
    const { req, payload } = request({
      codeChanges: true,
      dataOperations: false,
    });
    const response = await call(path, req);
    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toContain(
      "Операции с данными выключены",
    );
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });

  it.each([
    "/changes/:id/reject-plan",
    "/changes/:id/reject-implementation",
    "/changes/:id/reject-preview",
    "/changes/:id/reject-release",
    "/data-operations/:id/reject",
    "/data-operations/:id/approve-rollback",
    "/data-operations/:id/rollback",
  ])(
    "%s продолжает действующую валидацию при выключенных инструментах",
    async (path) => {
      const { req, payload } = request({
        codeChanges: false,
        dataOperations: false,
      });
      const response = await call(path, req);
      expect(response.status).toBe(400);
      expect(req.json).toHaveBeenCalled();
      expect(payload.find).toHaveBeenCalledTimes(1);
    },
  );

  it("отсутствие настройки сохраняет defaults, а переключатели действуют независимо", async () => {
    await expect(
      requireCodexChatTool(request(null).req, "codeChanges", options),
    ).resolves.toBeUndefined();
    await expect(
      requireCodexChatTool(
        request({ codeChanges: true, dataOperations: false }).req,
        "codeChanges",
        options,
      ),
    ).resolves.toBeUndefined();
    await expect(
      requireCodexChatTool(
        request({ codeChanges: false, dataOperations: true }).req,
        "dataOperations",
        options,
      ),
    ).resolves.toBeUndefined();
  });

  it("повторное действие читает изменённые настройки, повреждённая запись закрывает доступ", async () => {
    const { req, payload } = request({
      codeChanges: true,
      dataOperations: true,
    });
    await requireCodexChatTool(req, "codeChanges", options);
    payload.find.mockResolvedValue({
      docs: [
        {
          id: 1,
          provider: "codex",
          enabled: true,
          credentialEnvelope: "synthetic-unused",
          configuration: {
            authMode: "apiKey",
            agent: {
              ...CODEX_AGENT_SETTINGS_DEFAULTS,
              execution: {
                ...CODEX_AGENT_SETTINGS_DEFAULTS.execution,
                enabled: true,
              },
              preview: {
                ...CODEX_AGENT_SETTINGS_DEFAULTS.preview,
                enabled: true,
              },
              release: {
                ...CODEX_AGENT_SETTINGS_DEFAULTS.release,
                enabled: true,
              },
              sourcePromotion: { enabled: true },
            },
            chat: {
              ...CODEX_CHAT_SETTINGS_DEFAULTS,
              tools: { codeChanges: false, dataOperations: true },
            },
          },
        },
      ],
      totalDocs: 1,
    });
    await expect(
      requireCodexChatTool(req, "codeChanges", options),
    ).rejects.toMatchObject({ status: 403 });
    payload.find.mockResolvedValue({
      docs: [
        {
          id: 1,
          provider: "codex",
          configuration: { authMode: "chatgpt", chat: null },
        },
      ],
      totalDocs: 1,
    } as never);
    await expect(
      requireCodexChatTool(req, "codeChanges", options),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("настройки не повышают права неавторизованного пользователя", async () => {
    const { req, payload } = request(
      { codeChanges: true, dataOperations: true },
      false,
    );
    const response = await call("/conversations/:id/changes", req);
    expect(response.status).toBe(401);
    expect(payload.find).not.toHaveBeenCalled();
  });
});
