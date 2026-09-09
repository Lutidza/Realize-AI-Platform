// @vitest-environment node

/**
 * @file tests/int/codex-integration-api.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Проверяет изоляцию Codex DTO, vault, optimistic revision и управляющих API без сети.
 */

import { randomBytes, randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseCodexIntegrationConfiguration,
  parseCompleteCodexBrowserLoginInput,
  parseCodexLoginSessionInput,
  parseSaveCodexIntegrationInput,
  parseStartCodexLoginInput,
  parseTestCodexIntegrationInput,
} from "@realize/ai-contracts";
import { createCodexIntegrationHandlers } from "../../packages/payload-ai-plugin/src/endpoints/codexIntegrationHandlers";
import { createCodexLoginEndpoints } from "../../packages/payload-ai-plugin/src/endpoints/codexLoginEndpoints.config";
import { createIntegrationHandlers } from "../../packages/payload-ai-plugin/src/endpoints/integrationHandlers";
import { toCodexIntegrationDTO } from "../../packages/payload-ai-plugin/src/endpoints/integrationMappers";
import { saveCompletedCodexLogin } from "../../packages/payload-ai-plugin/src/integrations/codex/saveCompletedCodexLogin.service";
import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
} from "../../packages/payload-ai-plugin/src/integrations/credentialVault";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";

const mocks = vi.hoisted(() => ({
  createCredential: vi.fn(),
  createAccessTokenCredential: vi.fn(),
  readWorkloadConfiguration: vi.fn(),
  testCredential: vi.fn(),
  acquire: vi.fn(),
  dispose: vi.fn(),
  readAuth: vi.fn(),
  lock: vi.fn(),
  releaseLock: vi.fn(),
}));
vi.mock("payload", () => ({
  initTransaction: vi.fn().mockResolvedValue(false),
  commitTransaction: vi.fn(),
  killTransaction: vi.fn(),
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/integrations/codex/createCodexAccessTokenCredential.service",
  () => ({
    createCodexAccessTokenCredential: mocks.createAccessTokenCredential,
  }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/integrations/codex/createCodexAPIKeyCredential.service",
  () => ({ createCodexAPIKeyCredential: mocks.createCredential }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/integrations/codex/testCodexCredential.service",
  () => ({ testCodexCredential: mocks.testCredential }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/integrations/codex/runtime/CodexConnection.service",
  () => ({
    CodexConnectionService: class {
      acquire = mocks.acquire;
    },
  }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/integrations/codex/runtime/CodexConnectionLock.adapter",
  () => ({ acquireCodexConnectionLock: mocks.lock }),
);
vi.mock("@realize/codex-adapter/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@realize/codex-adapter/profile")>()),
  readCodexProfileAuth: mocks.readAuth,
  readCodexWorkloadIdentityConfiguration: mocks.readWorkloadConfiguration,
}));

const KEY_ENV = "REALIZE_TEST_CODEX_VAULT_KEY";
const KEY = randomBytes(32).toString("base64");
const API_KEY = "synthetic-codex-api-key-1234567890";
const AUTH_JSON = JSON.stringify({
  auth_mode: "apikey",
  OPENAI_API_KEY: API_KEY,
});
const ACCESS_TOKEN = "synthetic-codex-access-token-1234567890";
const TOKEN_JSON = JSON.stringify({
  type: "codexAccessToken",
  accessToken: ACCESS_TOKEN,
});
const options = {
  access: { canManageIntegrations: () => true },
  integrations: { encryptionKeyEnv: KEY_ENV },
} as unknown as SanitizedRealizeAIPluginOptions;
const binding = { connectionKey: "codex:primary", provider: "codex" };
const configuration = { authMode: "apiKey" };

const connection = (overrides: Record<string, unknown> = {}): AIDocument => ({
  id: 1,
  configuration,
  connectionKey: binding.connectionKey,
  displayName: "Основной Codex",
  enabled: true,
  credentialEnvelope: encryptIntegrationCredential({
    binding,
    encryptionKey: KEY,
    plaintext: AUTH_JSON,
  }),
  lastTestStatus: "never",
  provider: "codex",
  revision: 2,
  updatedAt: "2026-09-09T00:00:00.000Z",
  ...overrides,
});

/** Подмена persistence учитывает CAS и provider key; parsing, services, mapper и vault реальные. */
const fixture = (initial?: AIDocument) => {
  let stored = initial;
  const events: AIDocument[] = [];
  const matches = (
    document: AIDocument,
    where?: Record<string, unknown>,
  ): boolean => {
    if (!where) return true;
    if (Array.isArray(where.and))
      return where.and.every((part) => matches(document, part));
    return Object.entries(where).every(
      ([key, value]) => document[key] === (value as { equals: unknown }).equals,
    );
  };
  const payload = {
    config: { secret: "synthetic-test-installation-secret" },
    db: { defaultIDType: "number", pool: { connect: vi.fn() } },
    logger: { error: vi.fn() },
    find: vi.fn(
      async ({
        collection,
        where,
      }: {
        collection: string;
        where: Record<string, unknown>;
      }) => {
        const rows =
          collection === "realize-ai-integrations"
            ? stored
              ? [stored]
              : []
            : events;
        const docs = rows.filter((document) => matches(document, where));
        return { docs, totalDocs: docs.length };
      },
    ),
    create: vi.fn(
      async ({
        collection,
        data,
      }: {
        collection: string;
        data: Record<string, unknown>;
      }) => {
        const document: AIDocument = {
          id: collection === "realize-ai-integrations" ? 1 : events.length + 1,
          ...data,
          updatedAt: "2026-09-09T00:00:00.000Z",
        };
        if (collection === "realize-ai-integrations") stored = document;
        else events.push(document);
        return document;
      },
    ),
    update: vi.fn(
      async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: Record<string, unknown>;
      }) => {
        if (!stored || !matches(stored, where)) return { docs: [], errors: [] };
        stored = { ...stored, ...data };
        return { docs: [stored], errors: [] };
      },
    ),
    delete: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if (!stored || !matches(stored, where)) return { docs: [], errors: [] };
      const old = stored;
      stored = undefined;
      return { docs: [old], errors: [] };
    }),
  };
  const actorID = randomUUID();
  const request = (
    input: unknown,
    settings: { actorID?: string; authenticated?: boolean; key?: string } = {},
  ) =>
    ({
      headers: new Headers({ "idempotency-key": settings.key ?? randomUUID() }),
      json: async () => input,
      payload,
      user:
        settings.authenticated === false
          ? null
          : { id: settings.actorID ?? actorID },
    }) as unknown as PayloadRequest;
  return { actorID, events, payload, request, stored: () => stored };
};

beforeEach(() => {
  vi.stubEnv(KEY_ENV, KEY);
  vi.clearAllMocks();
  mocks.createCredential.mockResolvedValue(AUTH_JSON);
  mocks.createAccessTokenCredential.mockResolvedValue({
    authJSON: TOKEN_JSON,
    accountEmail: "admin@example.test",
    planType: "enterprise",
  });
  mocks.readWorkloadConfiguration.mockResolvedValue({
    federationRuleID: "synthetic-rule",
    identityTokenFile: "/synthetic/private/token",
    protectedDirectory: "/synthetic/private",
  });
  mocks.releaseLock.mockResolvedValue(undefined);
  mocks.lock.mockResolvedValue({
    signal: new AbortController().signal,
    release: mocks.releaseLock,
  });
  mocks.dispose.mockResolvedValue(undefined);
  mocks.readAuth.mockResolvedValue(AUTH_JSON);
  mocks.acquire.mockResolvedValue({
    authMode: "apiKey",
    environment: {},
    home: "/synthetic/isolated/codex",
    revision: 2,
    signal: new AbortController().signal,
    dispose: mocks.dispose,
  });
  mocks.testCredential.mockResolvedValue({
    checkedAt: "2026-09-09T00:00:00.000Z",
    status: "passed",
    message: "Synthetic account verified.",
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("Codex integration API", () => {
  it("сохраняет API key только зашифрованным native auth JSON и выдаёт allowlisted DTO", async () => {
    const state = fixture();
    const response = await createCodexIntegrationHandlers(options).save(
      state.request({
        authMode: "apiKey",
        apiKey: API_KEY,
        enabled: true,
        expectedRevision: 0,
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      configuration,
      provider: "codex",
      hasCredential: true,
      revision: 1,
    });
    expect(
      decryptIntegrationCredential({
        binding,
        encryptionKey: KEY,
        envelope: state.stored()?.credentialEnvelope as string,
      }),
    ).toBe(AUTH_JSON);
    expect(JSON.stringify(body)).not.toContain(API_KEY);
    expect(JSON.stringify(body)).not.toContain("credentialEnvelope");
    expect(JSON.stringify(state.events)).not.toContain(API_KEY);
    expect(JSON.stringify(state.events)).not.toContain(AUTH_JSON);
    expect(mocks.createCredential).toHaveBeenCalledWith(API_KEY);
  });

  it("сохраняет прежний credential при обновлении того же режима", async () => {
    const original = connection();
    const state = fixture(original);
    const response = await createCodexIntegrationHandlers(options).save(
      state.request({
        authMode: "apiKey",
        enabled: false,
        expectedRevision: 2,
      }),
    );
    expect(response.status).toBe(200);
    expect(state.stored()).toMatchObject({
      credentialEnvelope: original.credentialEnvelope,
      revision: 3,
      enabled: false,
    });
    expect(mocks.createCredential).not.toHaveBeenCalled();
  });

  it("не использует API key credential для нового режима ChatGPT", async () => {
    const state = fixture(connection());
    const response = await createCodexIntegrationHandlers(options).save(
      state.request({
        authMode: "chatgpt",
        enabled: true,
        expectedRevision: 2,
      }),
    );
    expect(response.status).toBe(400);
    expect(state.payload.update).not.toHaveBeenCalled();
  });

  it("отклоняет stale revision до обращения к Codex", async () => {
    const state = fixture(connection());
    const response = await createCodexIntegrationHandlers(options).save(
      state.request({
        authMode: "apiKey",
        apiKey: API_KEY,
        enabled: true,
        expectedRevision: 1,
      }),
    );
    expect(response.status).toBe(409);
    expect(mocks.createCredential).not.toHaveBeenCalled();
  });

  it("при отсутствии vault отклоняет сохранение до вызова auth adapter", async () => {
    vi.stubEnv(KEY_ENV, undefined);
    const state = fixture();
    const response = await createCodexIntegrationHandlers(options).save(
      state.request({
        authMode: "apiKey",
        apiKey: API_KEY,
        enabled: true,
        expectedRevision: 0,
      }),
    );
    expect(response.status).toBe(503);
    expect(mocks.createCredential).not.toHaveBeenCalled();
  });

  it("активный runtime блокирует изменение настроек до окончания refresh", async () => {
    const state = fixture(connection());
    mocks.lock.mockRejectedValue(new Error("synthetic busy"));
    const response = await createCodexIntegrationHandlers(options).save(
      state.request({
        authMode: "apiKey",
        enabled: false,
        expectedRevision: 2,
      }),
    );
    expect(response.status).toBe(503);
    expect(state.payload.update).not.toHaveBeenCalled();
  });

  it("после auth adapter повторно проверяет revision перед записью", async () => {
    const state = fixture(connection());
    mocks.createCredential.mockImplementation(async () => {
      const stored = state.stored();
      if (stored) stored.revision = 3;
      return AUTH_JSON;
    });
    const response = await createCodexIntegrationHandlers(options).save(
      state.request({
        authMode: "apiKey",
        apiKey: API_KEY,
        enabled: true,
        expectedRevision: 2,
      }),
    );
    expect(response.status).toBe(409);
    expect(state.payload.update).not.toHaveBeenCalled();
    expect(mocks.releaseLock).toHaveBeenCalledOnce();
  });

  it("сохраняет подтверждённый ChatGPT login через тот же vault и revision", async () => {
    const state = fixture();
    const nativeAuth = JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        id_token: "synthetic-id-token",
        access_token: "synthetic-oauth-access-token",
        refresh_token: "synthetic-oauth-refresh-token",
      },
    });
    const dto = await saveCompletedCodexLogin(state.request({}), options, {
      actorID: state.actorID,
      idempotencyKey: randomUUID(),
      input: { enabled: true, expectedRevision: 0 },
      authJSON: nativeAuth,
      accountEmail: "admin@example.test",
      planType: "plus",
    });
    expect(dto.configuration).toEqual({
      authMode: "chatgpt",
      loginMethod: "deviceCode",
      accountEmail: "admin@example.test",
      planType: "plus",
    });
    expect(JSON.stringify(dto)).not.toContain("access_token");
    expect(
      decryptIntegrationCredential({
        binding,
        encryptionKey: KEY,
        envelope: state.stored()?.credentialEnvelope as string,
      }),
    ).toBe(nativeAuth);
  });

  it("повтор сохранения не создаёт новый credential; чужой actor не переиспользует ключ", async () => {
    const state = fixture();
    const key = randomUUID();
    const input = {
      authMode: "apiKey",
      apiKey: API_KEY,
      enabled: true,
      expectedRevision: 0,
    };
    const handlers = createCodexIntegrationHandlers(options);
    expect((await handlers.save(state.request(input, { key }))).status).toBe(
      200,
    );
    expect((await handlers.save(state.request(input, { key }))).status).toBe(
      200,
    );
    expect(
      (
        await handlers.save(
          state.request(input, { key, actorID: randomUUID() }),
        )
      ).status,
    ).toBe(409);
    expect(mocks.createCredential).toHaveBeenCalledTimes(1);
  });

  it("test использует общий lease и не меняет credential/revision перед dispose", async () => {
    const original = connection();
    const state = fixture(original);
    mocks.dispose.mockImplementation(async () => {
      expect(state.stored()).toMatchObject({
        revision: 2,
        credentialEnvelope: original.credentialEnvelope,
        lastTestStatus: "passed",
      });
    });
    const response = await createCodexIntegrationHandlers(options).test(
      state.request({ expectedRevision: 2 }),
    );
    expect(response.status).toBe(200);
    expect(mocks.acquire).toHaveBeenCalledWith({ allowDisabled: true });
    expect(mocks.testCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        authJSON: AUTH_JSON,
        profile: expect.objectContaining({ home: "/synthetic/isolated/codex" }),
      }),
    );
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(state.events[0]).toMatchObject({
      provider: "codex",
      action: "tested",
    });
  });

  it("не принимает прежний Idempotency-Key для изменённого запроса", async () => {
    const state = fixture();
    const key = randomUUID();
    const input = {
      authMode: "apiKey",
      apiKey: API_KEY,
      enabled: true,
      expectedRevision: 0,
    };
    const handlers = createCodexIntegrationHandlers(options);
    expect((await handlers.save(state.request(input, { key }))).status).toBe(
      200,
    );
    expect(
      (
        await handlers.save(
          state.request({ ...input, enabled: false }, { key }),
        )
      ).status,
    ).toBe(409);
    expect(state.stored()?.enabled).toBe(true);
    expect(mocks.createCredential).toHaveBeenCalledTimes(1);
  });

  it("не сохраняет native auth JSON другого режима после подтверждения входа", async () => {
    const state = fixture();
    await expect(
      saveCompletedCodexLogin(state.request({}), options, {
        actorID: state.actorID,
        idempotencyKey: randomUUID(),
        input: { enabled: true, expectedRevision: 0 },
        authJSON: AUTH_JSON,
      }),
    ).rejects.toThrow();
    expect(state.payload.create).not.toHaveBeenCalled();
  });

  it("при несовпадении test revision закрывает lease и не обращается к аккаунту", async () => {
    const state = fixture(connection());
    const response = await createCodexIntegrationHandlers(options).test(
      state.request({ expectedRevision: 1 }),
    );
    expect(response.status).toBe(409);
    expect(mocks.testCredential).not.toHaveBeenCalled();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it("disconnect удаляет credential с CAS и создаёт redacted audit", async () => {
    const state = fixture(connection());
    const response = await createCodexIntegrationHandlers(options).disconnect(
      state.request({ expectedRevision: 2 }),
    );
    expect(response.status).toBe(200);
    expect(state.stored()).toBeUndefined();
    expect(state.events[0]).toMatchObject({
      provider: "codex",
      action: "disconnected",
      metadata: { revision: 2 },
    });
    expect(mocks.acquire).not.toHaveBeenCalled();
  });

  it("каталог возвращает Codex через общий mapper без credential", async () => {
    const state = fixture(connection());
    const response = await createIntegrationHandlers(options).list(
      state.request({}),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.data.providers.map((provider: { id: string }) => provider.id),
    ).toEqual(["github", "codex"]);
    expect(body.data.connections).toHaveLength(1);
    expect(body.data.connections[0].provider).toBe("codex");
    expect(JSON.stringify(body)).not.toContain("credentialEnvelope");
  });

  it.each(["save", "test", "disconnect", "environment"] as const)(
    "%s отклоняет запрос без авторизации",
    async (name) => {
      const state = fixture();
      const response = await createCodexIntegrationHandlers(options)[name](
        state.request({}, { authenticated: false }),
      );
      expect(response.status).toBe(401);
      expect(state.payload.find).not.toHaveBeenCalled();
    },
  );

  it("сохраняет access token в vault без утечки секрета и включает его в idempotency hash", async () => {
    const state = fixture();
    const key = randomUUID();
    const input = {
      authMode: "accessToken",
      accessToken: ACCESS_TOKEN,
      enabled: true,
      expectedRevision: 0,
    };
    const handler = createCodexIntegrationHandlers(options).save;
    const response = await handler(state.request(input, { key }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      configuration: { authMode: "accessToken", planType: "enterprise" },
      hasCredential: true,
    });
    expect(
      decryptIntegrationCredential({
        binding,
        encryptionKey: KEY,
        envelope: state.stored()?.credentialEnvelope as string,
      }),
    ).toBe(TOKEN_JSON);
    expect(JSON.stringify([body, state.events])).not.toContain(ACCESS_TOKEN);
    expect((await handler(state.request(input, { key }))).status).toBe(200);
    expect(mocks.createAccessTokenCredential).toHaveBeenCalledOnce();
    expect(
      (
        await handler(
          state.request(
            { ...input, accessToken: `${ACCESS_TOKEN}changed` },
            { key },
          ),
        )
      ).status,
    ).toBe(409);
    const envelope = state.stored()?.credentialEnvelope;
    expect(
      (
        await handler(
          state.request({
            authMode: "accessToken",
            enabled: false,
            expectedRevision: 1,
          }),
        )
      ).status,
    ).toBe(200);
    expect(state.stored()?.credentialEnvelope).toBe(envelope);
  });

  it("WIF сохраняет конфигурацию без vault и удаляет credential прежнего режима", async () => {
    vi.stubEnv(KEY_ENV, undefined);
    const state = fixture(
      connection({
        credentialUpdatedAt: "2026-09-09T00:00:00.000Z",
        lastTestStatus: "passed",
      }),
    );
    const response = await createCodexIntegrationHandlers(options).save(
      state.request({
        authMode: "workloadIdentity",
        enabled: true,
        expectedRevision: 2,
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      configuration: { authMode: "workloadIdentity" },
      hasCredential: false,
      revision: 3,
      lastTestStatus: "never",
    });
    expect(state.stored()).toMatchObject({
      credentialEnvelope: null,
      credentialUpdatedAt: null,
    });
    expect(mocks.createCredential).not.toHaveBeenCalled();
    expect(mocks.createAccessTokenCredential).not.toHaveBeenCalled();
    const unconfigured = fixture();
    mocks.readWorkloadConfiguration.mockRejectedValue(
      new Error("private-server-token-path"),
    );
    const failure = await createCodexIntegrationHandlers(options).save(
      unconfigured.request({
        authMode: "workloadIdentity",
        enabled: true,
        expectedRevision: 0,
      }),
    );
    expect(failure.status).toBe(503);
    expect(JSON.stringify(await failure.json())).not.toContain(
      "private-server-token-path",
    );
    expect(unconfigured.payload.create).not.toHaveBeenCalled();
  });

  it("не переиспользует чужой credential при смене на access token", async () => {
    const state = fixture(connection());
    const response = await createCodexIntegrationHandlers(options).save(
      state.request({
        authMode: "accessToken",
        enabled: true,
        expectedRevision: 2,
      }),
    );
    expect(response.status).toBe(400);
    expect(state.payload.update).not.toHaveBeenCalled();
  });

  it("выдаёт только безопасную готовность WIF с no-store", async () => {
    const state = fixture();
    const handler = createCodexIntegrationHandlers(options).environment;
    const response = await handler(state.request({}));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).data).toEqual({
      workloadIdentity: { configured: true, message: expect.any(String) },
    });
    mocks.readWorkloadConfiguration.mockRejectedValue(
      new Error("private-server-token-path"),
    );
    const failed = await handler(state.request({}));
    const body = await failed.json();
    expect(body.data.workloadIdentity.configured).toBe(false);
    expect(JSON.stringify(body)).not.toContain("private-server-token-path");
  });

  it.each(["accessToken", "workloadIdentity"] as const)(
    "проверяет %s через lease без чтения auth.json",
    async (authMode) => {
      const state = fixture(
        connection({
          configuration: { authMode },
          ...(authMode === "workloadIdentity"
            ? { credentialEnvelope: null }
            : {}),
        }),
      );
      mocks.acquire.mockResolvedValue({
        authMode,
        environment: {},
        home: "/synthetic/isolated/codex",
        revision: 2,
        signal: new AbortController().signal,
        dispose: mocks.dispose,
      });
      const response = await createCodexIntegrationHandlers(options).test(
        state.request({ expectedRevision: 2 }),
      );
      expect(response.status).toBe(200);
      expect(mocks.readAuth).not.toHaveBeenCalled();
      expect(mocks.testCredential).toHaveBeenCalledWith(
        expect.objectContaining({ authMode, authJSON: undefined }),
      );
      expect(mocks.dispose).toHaveBeenCalledOnce();
    },
  );

  it("новый callback endpoint сохраняет access boundary и не пишет callback в ошибку", async () => {
    const endpoint = createCodexLoginEndpoints(options).find((entry) =>
      entry.path.endsWith("/complete"),
    )!;
    const state = fixture();
    expect(
      (await endpoint.handler(state.request({}, { authenticated: false })))
        .status,
    ).toBe(401);
    const response = await endpoint.handler(
      state.request({
        sessionID: randomUUID(),
        callbackURL: "https://private.invalid/?code=private-code",
      }),
    );
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain("private-code");
    expect(state.payload.create).not.toHaveBeenCalled();
  });
});

describe("Codex integration contracts", () => {
  it.each([
    { authMode: "oauth", enabled: true, expectedRevision: 0 },
    {
      authMode: "chatgpt",
      apiKey: API_KEY,
      enabled: true,
      expectedRevision: 0,
    },
    { authMode: "apiKey", enabled: true, expectedRevision: -1 },
    { authMode: "apiKey", enabled: true, expectedRevision: "0" },
    {
      authMode: "apiKey",
      enabled: true,
      expectedRevision: 0,
      accessToken: "synthetic",
    },
    {
      authMode: "apiKey",
      enabled: true,
      expectedRevision: 0,
      codexHome: "/home/example/.codex",
    },
    {
      authMode: "apiKey",
      enabled: true,
      expectedRevision: 0,
      apiKey: "bad\nkey",
    },
  ])("отклоняет неподдерживаемый ввод без возврата его значений", (input) => {
    expect(() => parseSaveCodexIntegrationInput(input)).toThrow();
  });

  it("не принимает OAuth-токены в login input и test draft", () => {
    expect(() =>
      parseStartCodexLoginInput({
        enabled: true,
        expectedRevision: 0,
        refreshToken: "synthetic",
      }),
    ).toThrow();
    expect(() =>
      parseTestCodexIntegrationInput({ expectedRevision: 1, apiKey: API_KEY }),
    ).toThrow();
    expect(() =>
      parseCodexLoginSessionInput({ sessionID: "../auth.json" }),
    ).toThrow();
    expect(
      parseCodexLoginSessionInput({ sessionID: randomUUID() }),
    ).toHaveProperty("sessionID");
  });

  it("mapper отклоняет повреждённую конфигурацию и чужой provider", () => {
    expect(() =>
      parseCodexIntegrationConfiguration({
        authMode: "chatgpt",
        accessToken: "synthetic",
      }),
    ).toThrow();
    expect(() =>
      toCodexIntegrationDTO(connection({ provider: "github" })),
    ).toThrow();
    expect(() => toCodexIntegrationDTO(connection({ revision: 0 }))).toThrow();
  });

  it("принимает только официальный login method и отдельный write-only token", () => {
    expect(
      parseStartCodexLoginInput({ enabled: true, expectedRevision: 0 }),
    ).toMatchObject({ loginMethod: "deviceCode" });
    expect(
      parseStartCodexLoginInput({
        enabled: true,
        expectedRevision: 0,
        loginMethod: "browser",
      }),
    ).toHaveProperty("loginMethod", "browser");
    expect(() =>
      parseStartCodexLoginInput({
        enabled: true,
        expectedRevision: 0,
        loginMethod: "password",
      }),
    ).toThrow();
    expect(
      parseSaveCodexIntegrationInput({
        authMode: "accessToken",
        accessToken: ACCESS_TOKEN,
        enabled: true,
        expectedRevision: 0,
      }),
    ).toHaveProperty("accessToken", ACCESS_TOKEN);
    for (const input of [
      { authMode: "workloadIdentity", identityTokenFile: "/private/token" },
      { authMode: "workloadIdentity", federationRuleID: "private-rule" },
      { authMode: "workloadIdentity", accessToken: ACCESS_TOKEN },
      { authMode: "chatgpt", accessToken: ACCESS_TOKEN },
      { authMode: "accessToken", apiKey: API_KEY },
      { authMode: "accessToken", loginMethod: "browser" },
      { authMode: "accessToken", accessToken: "bad\ntoken" },
    ])
      expect(() =>
        parseSaveCodexIntegrationInput({
          enabled: true,
          expectedRevision: 0,
          ...input,
        }),
      ).toThrow();
  });

  it("callback parser запрещает чужой origin, дубликаты state и произвольные адреса", () => {
    const sessionID = randomUUID();
    const callbackURL =
      "http://localhost:1455/auth/callback?state=synthetic&code=synthetic";
    expect(
      parseCompleteCodexBrowserLoginInput({ sessionID, callbackURL }),
    ).toEqual({ sessionID, callbackURL });
    for (const url of [
      callbackURL.replace("localhost", "127.0.0.1"),
      callbackURL.replace("1455", "1456"),
      callbackURL.replace("/auth/callback", "/elsewhere"),
      `${callbackURL}&state=another`,
      `${callbackURL}&code=another`,
      `${callbackURL}#fragment`,
      callbackURL.replace("localhost", "user:pass@localhost"),
      "https://example.test/auth/callback?state=private&code=private",
    ])
      expect(() =>
        parseCompleteCodexBrowserLoginInput({ sessionID, callbackURL: url }),
      ).toThrow();
  });
});
