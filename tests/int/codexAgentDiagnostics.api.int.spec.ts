// @vitest-environment node

/**
 * @file tests/int/codexAgentDiagnostics.api.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Проверяет безопасную диагностику, свежие настройки и различие прав и готовности исполнителя.
 */

import { randomBytes } from "node:crypto";
import type { PayloadRequest } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODEX_AGENT_SETTINGS_DEFAULTS,
  CODEX_CHAT_SETTINGS_DEFAULTS,
  type CodexAgentDiagnosticsDTO,
  type CodexAgentSettingsDTO,
} from "@realize/ai-contracts";
import { createAIEndpoints } from "../../packages/payload-ai-plugin/src/endpoints";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { sanitizeOptions } from "../../packages/payload-ai-plugin/src/options";
import { encryptIntegrationCredential } from "../../packages/payload-ai-plugin/src/integrations/credentialVault";

const mocks = vi.hoisted(() => ({ health: vi.fn() }));
vi.mock(
  "../../packages/payload-ai-plugin/src/runtime/getControlPlaneClient",
  () => ({ getControlPlaneClient: () => ({ health: mocks.health }) }),
);

const keyEnv = "REALIZE_TEST_DIAGNOSTICS_KEY";
const signingEnv = "REALIZE_TEST_DIAGNOSTICS_SIGNING";
const key = randomBytes(32).toString("base64");

/** Репозиторий возвращает текущую запись; диагностика не получает ambient auth и ничего не сохраняет. */
const fixture = () => {
  let configuration = {
    authMode: "apiKey",
    agent: structuredClone(CODEX_AGENT_SETTINGS_DEFAULTS),
    chat: structuredClone(CODEX_CHAT_SETTINGS_DEFAULTS),
  };
  let codex: AIDocument | undefined = {
    id: 1,
    provider: "codex",
    connectionKey: "codex:primary",
    revision: 4,
    displayName: "Сохранённый Codex",
    lastTestStatus: "never",
    updatedAt: "2026-09-11T00:00:00.000Z",
    enabled: true,
    configuration,
    credentialEnvelope: encryptIntegrationCredential({
      binding: { provider: "codex", connectionKey: "codex:primary" },
      encryptionKey: key,
      plaintext: JSON.stringify({
        auth_mode: "apikey",
        OPENAI_API_KEY: "synthetic-diagnostics-key-123456789",
      }),
    }),
    privateMarker: "must-not-escape",
  };
  let github: AIDocument | undefined;
  const canUseChat = vi.fn(() => true);
  const canManageIntegrations = vi.fn(() => true);
  const options = sanitizeOptions({
    runtime: {
      mode: "local-development",
      controlPlaneTokenEnv: "REALIZE_TEST_DIAGNOSTICS_CP_TOKEN",
    },
    integrations: { encryptionKeyEnv: keyEnv },
    execution: { signingSecretEnv: signingEnv },
    access: {
      canUseChat,
      canManageIntegrations,
      canViewRuns: () => true,
      canManageAIConfiguration: () => true,
      canManageData: () => true,
      canApproveRelease: () => false,
    },
  });
  const payload = {
    db: {
      defaultIDType: "number",
      pool: {
        query: vi.fn(async () => ({
          rows: [
            {
              instance_key: "diagnostics-worker",
              state: "idle",
              fresh: true,
              last_seen_at: "2026-09-11T00:00:00.000Z",
              current_kind: null,
              current_change_request: null,
              capabilities: {
                execution: true,
                preview: true,
                sourcePromotion: true,
                release: true,
              },
            },
          ],
        })),
      },
    },
    logger: { error: vi.fn() },
    find: vi.fn(
      async ({ where }: { where: { connectionKey: { equals: string } } }) => {
        const document =
          where.connectionKey.equals === "codex:primary" ? codex : github;
        return { docs: document ? [structuredClone(document)] : [] };
      },
    ),
    create: vi.fn(),
    update: vi.fn(),
  };
  const req = {
    payload,
    user: { id: "actor" },
    headers: new Headers(),
  } as unknown as PayloadRequest;
  const endpoints = createAIEndpoints(options);
  const call = (path = "/integrations/codex/diagnostics") => {
    const endpoint = endpoints.find(
      (item) => item.method === "get" && item.path === `/realize-ai${path}`,
    );
    if (!endpoint) throw new Error("Missing diagnostics endpoint");
    return endpoint.handler(req);
  };
  return {
    options,
    payload,
    req,
    call,
    canUseChat,
    canManageIntegrations,
    read: async (): Promise<CodexAgentDiagnosticsDTO> => {
      const response = await call();
      expect(response.status).toBe(200);
      return (await response.json()).data;
    },
    setCodex: (value: AIDocument | undefined) => {
      codex = value;
    },
    codex: () => codex!,
    configure: (
      agent: Partial<CodexAgentSettingsDTO> = {},
      codeChanges = true,
    ) => {
      configuration = {
        ...configuration,
        agent: { ...configuration.agent, ...agent },
        chat: {
          ...configuration.chat,
          tools: { ...configuration.chat.tools, codeChanges },
        },
      };
      codex = { ...codex!, configuration };
    },
    setGitHub: (value: AIDocument) => {
      github = value;
    },
  };
};

const enabledStages = {
  execution: { ...CODEX_AGENT_SETTINGS_DEFAULTS.execution, enabled: true },
  preview: { ...CODEX_AGENT_SETTINGS_DEFAULTS.preview, enabled: true },
  sourcePromotion: { enabled: true },
  release: { ...CODEX_AGENT_SETTINGS_DEFAULTS.release, enabled: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(keyEnv, key);
  vi.stubEnv(signingEnv, "");
  mocks.health.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("Codex agent diagnostics", () => {
  it("блокирует только diagnostics для stale worker, не скрывая исправный runtime чата", async () => {
    const state = fixture();
    state.configure(enabledStages);
    vi.stubEnv(signingEnv, "s".repeat(32));
    state.payload.db.pool.query.mockResolvedValueOnce({
      rows: [
        {
          instance_key: "diagnostics-worker",
          state: "busy",
          fresh: false,
          last_seen_at: "2026-09-11T00:00:00.000Z",
          current_kind: null,
          current_change_request: null,
          capabilities: {
            execution: true,
            preview: true,
            sourcePromotion: true,
            release: true,
          },
        },
      ],
    });
    const result = await state.read();
    expect(result.runtime.state).toBe("ready");
    expect(result.worker.state).toBe("unavailable");
    expect(result.operations.execution).toMatchObject({ state: "blocked" });
    expect(result.operations.execution.reason).toContain("Связь");
  });

  it("использует capabilities живого worker для release и не подменяет их окружением Next", async () => {
    const state = fixture();
    state.configure(enabledStages);
    vi.stubEnv(signingEnv, "s".repeat(32));
    state.payload.db.pool.query.mockResolvedValueOnce({
      rows: [
        {
          instance_key: "diagnostics-worker",
          state: "idle",
          fresh: true,
          last_seen_at: "2026-09-11T00:00:00.000Z",
          current_kind: null,
          current_change_request: null,
          capabilities: {
            execution: true,
            preview: true,
            sourcePromotion: false,
            release: false,
          },
        },
      ],
    });
    const result = await state.read();
    expect(result.worker.state).toBe("available");
    expect(result.operations.execution.state).toBe("allowed");
    expect(result.operations.release.state).toBe("blocked");
  });

  it("возвращает безопасную недоступность при ошибке heartbeat query", async () => {
    const state = fixture();
    state.payload.db.pool.query.mockRejectedValueOnce(
      new Error("private connection secret"),
    );
    const result = await state.read();
    expect(result.worker.state).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("private connection secret");
  });

  it("авторизует integration manager до чтения БД и проверки транспорта", async () => {
    const state = fixture();
    state.req.user = null;
    expect((await state.call()).status).toBe(401);
    state.req.user = { id: "actor" } as unknown as PayloadRequest["user"];
    state.canManageIntegrations.mockReturnValue(false);
    expect((await state.call()).status).toBe(403);
    expect(state.payload.find).not.toHaveBeenCalled();
    expect(mocks.health).not.toHaveBeenCalled();
  });

  it("выдаёт allowlist, defaults модели и фактический worker без записей или внешней авторизации", async () => {
    const state = fixture();
    const result = await state.read();
    expect(result.connection).toEqual({
      connectionKey: "codex:primary",
      displayName: "Сохранённый Codex",
      revision: 4,
      authMode: "apiKey",
    });
    expect(result.runtime.state).toBe("ready");
    expect(result.models).toEqual({ model: "", reviewModel: "" });
    expect(result.worker.state).toBe("available");
    expect(result.accessTest).toEqual({ status: "never" });
    expect(Number.isFinite(Date.parse(result.checkedAt))).toBe(true);
    expect(
      Object.values(result.operations).every(
        (item) => item.state === "disabled",
      ),
    ).toBe(true);
    expect(state.payload.find).toHaveBeenCalledTimes(1);
    expect(state.payload.create).not.toHaveBeenCalled();
    expect(state.payload.update).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(
      /credentialEnvelope|OPENAI_API_KEY|synthetic-diagnostics|must-not-escape/,
    );
  });

  it.each(["missing", "credential", "configuration", "vault", "database"])(
    "не заменяет подключение здоровым транспортом: %s",
    async (failure) => {
      const state = fixture();
      if (failure === "missing") state.setCodex(undefined);
      if (failure === "credential")
        state.setCodex({ ...state.codex(), credentialEnvelope: null });
      if (failure === "configuration")
        state.setCodex({
          ...state.codex(),
          configuration: { authMode: "unknown" },
        });
      if (failure === "vault") vi.stubEnv(keyEnv, "");
      if (failure === "database")
        state.payload.find.mockRejectedValue(
          new Error("private database address"),
        );
      const result = await state.read();
      expect(result.runtime.state).toBe("unavailable");
      if (!result.connection)
        expect(
          Object.values(result.operations).every(
            (item) => item.state === "blocked",
          ),
        ).toBe(true);
      expect(mocks.health).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain("private database address");
    },
  );

  it("off и isolated блокируют операции, сохраняя диагностику и последнюю проверку доступа", async () => {
    const state = fixture();
    state.configure(enabledStages);
    state.setCodex({
      ...state.codex(),
      enabled: false,
      lastTestStatus: "passed",
      lastTestedAt: "2026-09-11T01:02:03.000Z",
    });
    let result = await state.read();
    expect(result.runtime.state).toBe("disabled");
    expect(result.accessTest).toEqual({
      status: "passed",
      checkedAt: "2026-09-11T01:02:03.000Z",
    });
    expect(
      Object.values(result.operations).every(
        (item) => item.state === "blocked",
      ),
    ).toBe(true);
    state.setCodex({ ...state.codex(), enabled: true });
    state.options.runtime.isolated = true;
    result = await state.read();
    expect(result.runtime.reason).toContain("изолированном");
    expect(mocks.health).not.toHaveBeenCalled();
  });

  it("manager без canUseChat видит диагностику с заблокированными действиями", async () => {
    const state = fixture();
    state.configure(enabledStages);
    state.canUseChat.mockReturnValue(false);
    const result = await state.read();
    expect(result.runtime.state).toBe("unavailable");
    expect(result.runtime.reason).toContain("учётной записи");
    expect(
      Object.values(result.operations).every(
        (item) =>
          item.state === "blocked" && item.reason.includes("учётной записи"),
      ),
    ).toBe(true);
    expect((await state.call("/status")).status).toBe(403);
  });

  it("выключенный codeChanges блокирует все стадии независимо от их переключателей", async () => {
    const state = fixture();
    state.configure(enabledStages, false);
    const result = await state.read();
    expect(
      Object.values(result.operations).every(
        (item) =>
          item.state === "blocked" && item.reason.includes("инструментов чата"),
      ),
    ).toBe(true);
  });

  it("проверяет серверную подпись execution и зависимость preview от разрешения execution", async () => {
    const state = fixture();
    state.configure(enabledStages);
    let result = await state.read();
    expect(result.operations.execution.state).toBe("blocked");
    expect(result.operations.execution.reason).toContain("подпись");
    vi.stubEnv(signingEnv, "s".repeat(32));
    result = await state.read();
    expect(result.operations.execution.state).toBe("allowed");
    expect(result.operations.release.state).toBe("allowed");
    state.configure({ execution: CODEX_AGENT_SETTINGS_DEFAULTS.execution });
    result = await state.read();
    expect(result.operations.execution.state).toBe("disabled");
    expect(result.operations.preview.state).toBe("blocked");
    expect(result.operations.preview.reason).toContain(
      "разрешите выполнение кода",
    );
  });

  it("публикация требует проверенный GitHub и defaultBranch; готовность worker не выдумывается", async () => {
    const state = fixture();
    state.configure({ sourcePromotion: { enabled: true } });
    expect((await state.read()).operations.sourcePromotion.state).toBe(
      "blocked",
    );
    const github = {
      id: 2,
      provider: "github",
      enabled: true,
      revision: 1,
      lastTestStatus: "passed",
      credentialEnvelope: "synthetic-envelope",
      configuration: {
        repositoryURL: "https://github.com/example/repository",
        repositorySlug: "example/repository",
      },
    };
    state.setGitHub(github);
    expect((await state.read()).operations.sourcePromotion.reason).toContain(
      "основную ветку",
    );
    state.setGitHub({
      ...github,
      configuration: { ...github.configuration, defaultBranch: "main" },
    });
    const result = await state.read();
    expect(result.operations.sourcePromotion.state).toBe("allowed");
    expect(result.worker.state).toBe("available");
  });

  it("health статус совпадает с /status и не подменяет независимые разрешения worker", async () => {
    const state = fixture();
    state.configure({ release: enabledStages.release });
    mocks.health.mockRejectedValue(new Error("private transport token"));
    const result = await state.read();
    const status = (await (await state.call("/status")).json()).data;
    expect(result.runtime).toEqual(status);
    expect(result.runtime.state).toBe("unavailable");
    expect(result.operations.release.state).toBe("allowed");
    expect(JSON.stringify(result)).not.toContain("private transport token");
  });

  it("пустой адрес в центральном режиме даёт конкретную причину в диагностике и /status без health запроса", async () => {
    const state = fixture();
    state.options.runtime.mode = "central-control-plane";
    const result = await state.read();
    const status = (await (await state.call("/status")).json()).data;
    expect(result.runtime).toEqual(status);
    expect(result.runtime).toMatchObject({
      state: "unavailable",
      enabled: true,
      reason: "Адрес сервиса выполнения агента не настроен.",
    });
    expect(mocks.health).not.toHaveBeenCalled();
  });

  it("локальный режим без явного адреса сохраняет штатный fallback и общую health проверку", async () => {
    const state = fixture();
    expect(state.options.runtime.controlPlaneURL).toBeUndefined();
    const result = await state.read();
    const status = (await (await state.call("/status")).json()).data;
    expect(result.runtime).toEqual(status);
    expect(result.runtime).toMatchObject({
      state: "ready",
      mode: "local-development",
    });
    expect(mocks.health).toHaveBeenCalledTimes(2);
  });

  it.each(["disabled", "configuration", "credential", "ssh_without_api"])(
    "подготовка выпуска учитывает сохранённое непригодное подключение GitHub: %s",
    async (failure) => {
      const state = fixture();
      state.configure({ release: enabledStages.release });
      state.setGitHub({
        id: 2,
        provider: "github",
        connectionKey: "github:primary",
        revision: 1,
        enabled: failure !== "disabled",
        credentialEnvelope:
          failure === "credential" || failure === "ssh_without_api"
            ? null
            : "synthetic-envelope",
        configuration:
          failure === "configuration"
            ? { repositoryURL: "invalid" }
            : {
                repositoryURL: "https://github.com/example/repository",
                repositorySlug: "example/repository",
                ...(failure === "ssh_without_api"
                  ? { transport: "ssh", sshProfileRef: "selected-profile" }
                  : {}),
              },
      });
      const result = await state.read();
      expect(result.operations.release.state).toBe("blocked");
      expect(result.operations.release.reason).toContain("GitHub");
      expect(result.worker.state).toBe("available");
    },
  );

  it("подготовка выпуска допускает отсутствие GitHub и не требует проверки или defaultBranch для сохранённого подключения", async () => {
    const state = fixture();
    state.configure({
      release: enabledStages.release,
      sourcePromotion: { enabled: true },
    });
    expect((await state.read()).operations.release.state).toBe("allowed");
    state.setGitHub({
      id: 2,
      provider: "github",
      connectionKey: "github:primary",
      revision: 1,
      enabled: true,
      credentialEnvelope: "synthetic-envelope",
      lastTestStatus: "failed",
      configuration: {
        repositoryURL: "https://github.com/example/repository",
        repositorySlug: "example/repository",
      },
    });
    state.payload.find.mockClear();
    const result = await state.read();
    expect(result.operations.release.state).toBe("allowed");
    expect(result.operations.sourcePromotion.state).toBe("blocked");
    expect(state.payload.find).toHaveBeenCalledTimes(2);
  });

  it("метаданные проверки не утверждают генерацию и не сохраняют старую дату после сброса статуса", async () => {
    const state = fixture();
    state.setCodex({
      ...state.codex(),
      lastTestStatus: "failed",
      lastTestedAt: "2026-09-11T01:02:03.000Z",
    });
    expect((await state.read()).accessTest).toEqual({
      status: "failed",
      checkedAt: "2026-09-11T01:02:03.000Z",
    });
    state.setCodex({ ...state.codex(), lastTestStatus: "never" });
    expect((await state.read()).accessTest).toEqual({ status: "never" });
  });

  it("следующий запрос читает новую revision и модели без смешивания снимков", async () => {
    const state = fixture();
    state.configure({ model: "original-model", reviewModel: "review-model" });
    mocks.health.mockImplementationOnce(async () => {
      state.configure({ model: "next-model", reviewModel: "" });
      state.setCodex({ ...state.codex(), revision: 5, enabled: false });
      return true;
    });
    const before = await state.read();
    expect(before.connection?.revision).toBe(4);
    expect(before.models).toEqual({
      model: "original-model",
      reviewModel: "review-model",
    });
    expect(before.runtime.state).toBe("ready");
    const after = await state.read();
    expect(after.connection?.revision).toBe(5);
    expect(after.models).toEqual({ model: "next-model", reviewModel: "" });
    expect(after.runtime.state).toBe("disabled");
  });
});
