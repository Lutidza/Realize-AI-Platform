// @vitest-environment node

/**
 * @file tests/int/integration-transport-api.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Проверяет сохранение Git-транспорта и автора коммитов через API без БД и сети.
 */

import { randomBytes, randomUUID } from "node:crypto";
import type { PayloadRequest } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createIntegrationHandlers } from "../../packages/payload-ai-plugin/src/endpoints/integrationHandlers";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";
import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
} from "@realize/payload-ai-control/server/integration-vault";

vi.mock("payload", () => ({
  initTransaction: vi.fn().mockResolvedValue(false),
  commitTransaction: vi.fn(),
  killTransaction: vi.fn(),
}));

const KEY_ENV = "REALIZE_TEST_GIT_TRANSPORT_VAULT_KEY";
const KEY = randomBytes(32).toString("base64");
const TOKEN = "transport-api-synthetic-token-1234567890";
const options = {
  access: { canManageIntegrations: () => true },
  integrations: { encryptionKeyEnv: KEY_ENV },
} as unknown as SanitizedRealizeAIPluginOptions;

const configuration = {
  repositoryURL: "https://github.com/realize/store",
  repositorySlug: "realize/store",
  transport: "ssh",
  sshProfileRef: "delivery-main",
};
const savedConnection = (): AIDocument => ({
  id: 1,
  configuration,
  connectionKey: "github:primary",
  displayName: "Основной GitHub",
  enabled: true,
  lastTestStatus: "never",
  provider: "github",
  revision: 2,
  updatedAt: "2026-09-09T00:00:00.000Z",
});

/** Подменяет только persistence; реальные parsing, access, handler, mapper и vault сохраняются. */
const fixture = (existing?: AIDocument) => {
  let stored = existing;
  const events: Record<string, unknown>[] = [];
  const payload = {
    db: { defaultIDType: "number" },
    logger: { error: vi.fn() },
    find: vi.fn(async ({ collection }: { collection: string }) => ({
      docs: collection === "realize-ai-integrations" && stored ? [stored] : [],
      totalDocs: collection === "realize-ai-integrations" && stored ? 1 : 0,
    })),
    create: vi.fn(
      async ({
        collection,
        data,
      }: {
        collection: string;
        data: Record<string, unknown>;
      }) => {
        if (collection === "realize-ai-integration-events") {
          events.push(data);
          return { id: events.length, ...data };
        }
        stored = { id: 1, ...data, updatedAt: "2026-09-09T00:00:00.000Z" };
        return stored;
      },
    ),
    update: vi.fn(
      async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where?: unknown;
      }) => {
        stored = {
          ...stored,
          id: 1,
          ...data,
          updatedAt: "2026-09-09T00:00:00.000Z",
        };
        return where ? { docs: [stored], errors: [] } : stored;
      },
    ),
  };
  const request = (input: unknown, user = true): PayloadRequest =>
    ({
      headers: new Headers({ "idempotency-key": randomUUID() }),
      json: async () => input,
      payload,
      user: user ? { id: randomUUID() } : null,
    }) as unknown as PayloadRequest;
  return { events, payload, request, stored: () => stored };
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Git integration transport API", () => {
  it("сохраняет первое SSH-подключение без PAT и vault", async () => {
    vi.stubEnv(KEY_ENV, undefined);
    const state = fixture();
    const response = await createIntegrationHandlers(options).saveGitHub(
      state.request({
        enabled: true,
        expectedRevision: 0,
        repositoryURL: "https://www.github.com/realize/store.git",
        transport: "ssh",
        sshProfileRef: "delivery-main",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.configuration).toEqual(configuration);
    expect(body.data.hasCredential).toBe(false);
    expect(body.data.revision).toBe(1);
    expect(state.stored()?.credentialEnvelope).toBeUndefined();
    expect(body.data).not.toHaveProperty("credentialEnvelope");
    expect(state.events).toHaveLength(1);
    expect(state.events[0].metadata).toMatchObject({
      transport: "ssh",
      sshProfileRef: "delivery-main",
      tokenRotated: false,
    });
  });

  it("старый API input сохраняет transport/profile текущей SSH-записи", async () => {
    vi.stubEnv(KEY_ENV, undefined);
    const state = fixture(savedConnection());
    const response = await createIntegrationHandlers(options).saveGitHub(
      state.request({
        enabled: false,
        expectedRevision: 2,
        repositoryURL: configuration.repositoryURL,
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      configuration,
      enabled: false,
      revision: 3,
    });
    expect(state.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { and: [{ id: { equals: 1 } }, { revision: { equals: 2 } }] },
      }),
    );
  });

  it("записывает PAT в общий vault и возвращает только признак наличия", async () => {
    vi.stubEnv(KEY_ENV, KEY);
    const state = fixture();
    const response = await createIntegrationHandlers(options).saveGitHub(
      state.request({
        enabled: true,
        expectedRevision: 0,
        repositoryURL: configuration.repositoryURL,
        transport: "https",
        token: TOKEN,
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      hasCredential: true,
      configuration: { transport: "https" },
    });
    const envelope = state.stored()?.credentialEnvelope;
    expect(typeof envelope).toBe("string");
    expect(
      decryptIntegrationCredential({
        binding: { connectionKey: "github:primary", provider: "github" },
        encryptionKey: KEY,
        envelope: envelope as string,
      }),
    ).toBe(TOKEN);
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(JSON.stringify(body)).not.toContain(envelope);
    expect(JSON.stringify(state.events)).not.toContain(TOKEN);
  });

  it("сохраняет дополнительный PAT у SSH-подключения для REST", async () => {
    vi.stubEnv(KEY_ENV, KEY);
    const state = fixture(savedConnection());
    const response = await createIntegrationHandlers(options).saveGitHub(
      state.request({
        enabled: true,
        expectedRevision: 2,
        repositoryURL: configuration.repositoryURL,
        token: TOKEN,
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      hasCredential: true,
      configuration,
    });
    expect(state.stored()?.credentialEnvelope).toBeTypeOf("string");
  });

  it.each([
    { transport: "https", sshProfileRef: "main" },
    { transport: "ssh" },
    { transport: "ssh", sshProfileRef: "../secret" },
    { transport: "file" },
  ])(
    "отклоняет неправильное сочетание $transport/$sshProfileRef до записи",
    async (transport) => {
      const state = fixture();
      const response = await createIntegrationHandlers(options).saveGitHub(
        state.request({
          enabled: true,
          expectedRevision: 0,
          repositoryURL: configuration.repositoryURL,
          ...transport,
        }),
      );
      expect(response.status).toBe(400);
      expect(state.payload.create).not.toHaveBeenCalled();
      expect(state.payload.update).not.toHaveBeenCalled();
    },
  );

  it("отклоняет HTTPS без PAT", async () => {
    vi.stubEnv(KEY_ENV, KEY);
    const state = fixture(savedConnection());
    const response = await createIntegrationHandlers(options).saveGitHub(
      state.request({
        enabled: true,
        expectedRevision: 2,
        repositoryURL: configuration.repositoryURL,
        transport: "https",
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "token is required",
    );
    expect(state.payload.update).not.toHaveBeenCalled();
  });

  it("не принимает переданный PAT без vault даже для SSH", async () => {
    vi.stubEnv(KEY_ENV, undefined);
    const state = fixture(savedConnection());
    const response = await createIntegrationHandlers(options).saveGitHub(
      state.request({
        enabled: true,
        expectedRevision: 2,
        repositoryURL: configuration.repositoryURL,
        token: TOKEN,
      }),
    );
    expect(response.status).toBe(503);
    expect(state.payload.update).not.toHaveBeenCalled();
  });

  it("REST-проверка SSH-only записи явно требует API token и не делает запрос", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv(KEY_ENV, undefined);
    const state = fixture(savedConnection());
    const response = await createIntegrationHandlers(options).testGitHub(
      state.request({}),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "GitHub API token is required",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(state.payload.update).not.toHaveBeenCalled();
  });

  it("успешная REST-проверка не заявляет проверку SSH-профиля", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        full_name: "realize/store",
        default_branch: "main",
        permissions: { push: true },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const state = fixture(savedConnection());
    const response = await createIntegrationHandlers(options).testGitHub(
      state.request({ token: TOKEN }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("passed");
    expect(body.data.message).toContain("не проверяет SSH-профиль");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it("сохранение SSH сохраняет проверку пользователя и optimistic revision", async () => {
    const state = fixture(savedConnection());
    const input = {
      enabled: true,
      expectedRevision: 1,
      repositoryURL: configuration.repositoryURL,
    };
    const handlers = createIntegrationHandlers(options);
    expect(
      (await handlers.saveGitHub(state.request(input, false))).status,
    ).toBe(401);
    expect((await handlers.saveGitHub(state.request(input))).status).toBe(409);
    expect(state.payload.update).not.toHaveBeenCalled();
  });
});

describe("Git commit author API", () => {
  const author = {
    name: "Разработчик Realize",
    email: "developer@example.com",
  };
  const input = {
    enabled: true,
    expectedRevision: 2,
    repositoryURL: configuration.repositoryURL,
  };

  it.each(["passed", "failed"])(
    "сохраняет автора в JSONB и DTO, оставляя credential и lastTestStatus=%s",
    async (lastTestStatus) => {
      vi.stubEnv(KEY_ENV, KEY);
      const credentialEnvelope = encryptIntegrationCredential({
        binding: { connectionKey: "github:primary", provider: "github" },
        encryptionKey: KEY,
        plaintext: TOKEN,
      });
      const credentialUpdatedAt = "2026-09-08T01:02:03.000Z";
      const lastTestedAt = "2026-09-08T02:03:04.000Z";
      const state = fixture({
        ...savedConnection(),
        configuration: {
          repositoryURL: configuration.repositoryURL,
          repositorySlug: configuration.repositorySlug,
          defaultBranch: "main",
        },
        credentialEnvelope,
        credentialUpdatedAt,
        lastTestedAt,
        lastTestStatus,
      });
      const handlers = createIntegrationHandlers(options);
      const response = await handlers.saveGitHub(
        state.request({
          ...input,
          commitAuthor: {
            name: `  ${author.name}  `,
            email: `  ${author.email}  `,
          },
        }),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toMatchObject({
        configuration: {
          commitAuthor: author,
          defaultBranch: "main",
          transport: "https",
        },
        credentialUpdatedAt,
        hasCredential: true,
        lastTestedAt,
        lastTestStatus,
        revision: 3,
      });
      expect(state.stored()).toMatchObject({
        configuration: { commitAuthor: author },
        credentialEnvelope,
        credentialUpdatedAt,
        lastTestStatus,
      });
      const catalog = await (
        await handlers.list(state.request(undefined))
      ).json();
      expect(catalog.data.connections[0].configuration.commitAuthor).toEqual(
        author,
      );
      for (const result of [body, catalog, state.events]) {
        expect(JSON.stringify(result)).not.toContain(TOKEN);
        expect(JSON.stringify(result)).not.toContain(credentialEnvelope);
      }
      expect(state.events[0].metadata).not.toHaveProperty("commitAuthor");
    },
  );

  it("старый save input оставляет автора, а null удаляет его", async () => {
    vi.stubEnv(KEY_ENV, undefined);
    const state = fixture({
      ...savedConnection(),
      configuration: { ...configuration, commitAuthor: author },
    });
    const handlers = createIntegrationHandlers(options);
    const unchanged = await handlers.saveGitHub(state.request(input));
    expect(unchanged.status).toBe(200);
    expect((await unchanged.json()).data.configuration.commitAuthor).toEqual(
      author,
    );
    const removed = await handlers.saveGitHub(
      state.request({ ...input, expectedRevision: 3, commitAuthor: null }),
    );
    expect(removed.status).toBe(200);
    expect((await removed.json()).data.configuration).not.toHaveProperty(
      "commitAuthor",
    );
    expect(state.stored()?.configuration).not.toHaveProperty("commitAuthor");
  });

  it("создаёт первое SSH-подключение с автором без token и vault", async () => {
    vi.stubEnv(KEY_ENV, undefined);
    const state = fixture();
    const response = await createIntegrationHandlers(options).saveGitHub(
      state.request({
        ...input,
        expectedRevision: 0,
        transport: "ssh",
        sshProfileRef: "delivery-main",
        commitAuthor: author,
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.configuration.commitAuthor).toEqual(
      author,
    );
    expect(state.stored()?.credentialEnvelope).toBeUndefined();
  });

  it.each([
    { name: author.name },
    { email: author.email },
    { ...author, name: "   " },
    { ...author, email: "invalid-email-private-fixture" },
    { ...author, name: "invalid-author-private-fixture\n" },
    { ...author, email: "developer@example.com>" },
  ])(
    "отклоняет невалидного автора #%# до persistence без выдачи ввода",
    async (commitAuthor) => {
      const state = fixture(savedConnection());
      const response = await createIntegrationHandlers(options).saveGitHub(
        state.request({ ...input, commitAuthor }),
      );
      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).not.toContain(
        "private-fixture",
      );
      expect(state.payload.create).not.toHaveBeenCalled();
      expect(state.payload.update).not.toHaveBeenCalled();
    },
  );

  it("проверяет доступ и revision при сохранении автора", async () => {
    const state = fixture(savedConnection());
    const handlers = createIntegrationHandlers(options);
    expect(
      (
        await handlers.saveGitHub(
          state.request({ ...input, commitAuthor: author }, false),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handlers.saveGitHub(
          state.request({
            ...input,
            expectedRevision: 1,
            commitAuthor: author,
          }),
        )
      ).status,
    ).toBe(409);
    expect(state.payload.update).not.toHaveBeenCalled();
  });
});
