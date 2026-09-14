// @vitest-environment node
/**
 * @file tests/int/pageDiscoveryPlugin.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет допуск actor/run, бюджет чтений и источник Data Lane для найденной страницы.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Payload, PayloadRequest } from "payload";
import {
  parsePageDiscoveryCall,
  type PageDraftContextDTO,
  type UpdatePageDraftIntent,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import { authorizePageDiscovery } from "../../packages/payload-ai-plugin/src/chat-context/pageDiscoveryAuthorization.service";
import {
  createPageDiscoveryGrant,
  verifyPageDiscoveryGrant,
} from "../../packages/payload-ai-plugin/src/chat-context/pageDiscoveryGrant.service";
import { executePageDiscovery } from "../../packages/payload-ai-plugin/src/chat-context/pageDiscovery.service";
import { matchesPageDiscoveryContext } from "../../packages/payload-ai-plugin/src/chat-context/pageDiscoveryContext.validator";
import type { ChatRunContext } from "../../packages/payload-ai-plugin/src/chat-context/ChatRunContext.types";
import { PageDraftUpdate } from "../../packages/payload-ai-plugin/src/endpoints/pageDraftUpdate.service";
import {
  AIRepository,
  type AIDocument,
} from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { DataOperationRepository } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationRepository";
import { createDataOperationPlan } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationPlanning";
import { EndpointError } from "../../packages/payload-ai-plugin/src/endpoints/http";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";

const mocks = vi.hoisted(() => ({
  runStatus: vi.fn(),
  currentOptions: vi.fn(),
  createPlan: vi.fn(),
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/runtime/getControlPlaneClient",
  () => ({ getControlPlaneClient: () => ({ runStatus: mocks.runStatus }) }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/integrations/codex/resolveCodexRuntimeOptions.service",
  () => ({ resolveCodexRuntimeOptions: mocks.currentOptions }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/createTypedDataOperationPlan.service",
  () => ({ createTypedDataOperationPlan: mocks.createPlan }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/payloadTransaction",
  () => ({
    withPayloadTransaction: async (
      _req: unknown,
      work: () => Promise<unknown>,
    ) => work(),
  }),
);
vi.mock("payload", async (original) => ({
  ...(await original<typeof import("payload")>()),
  createLocalReq: vi.fn(async ({ user }, payload) => ({
    user,
    payload,
    transactionID: "tx",
  })),
}));

const snapshot: PageDraftContextDTO = {
  page: { id: "19", title: "Доставка", slug: "delivery" },
  updatedAt: "2026-09-13T09:00:00.000Z",
  fingerprint: "c".repeat(64),
  adapterVersion: "1.0",
  fields: [
    { path: "/title", label: "Название", value: "Доставка", maxLength: 160 },
  ],
};
const intent: UpdatePageDraftIntent = {
  version: "1.0",
  kind: "pages.updateDraft.v1",
  pageID: "19",
  expectedUpdatedAt: snapshot.updatedAt,
  expectedFingerprint: snapshot.fingerprint,
  changes: [{ path: "/title", before: "Доставка", after: "Условия доставки" }],
};
const options = {
  enabled: true,
  userCollection: "users",
  runtime: { controlPlaneTokenEnv: "REALIZE_PAGE_DISCOVERY_TEST_TOKEN" },
  pageDraft: { text: {} },
  access: { canUseChat: () => true, canManageData: () => true },
} as unknown as SanitizedRealizeAIPluginOptions;
let run: AIDocument;
let req: PayloadRequest;
let find: ReturnType<typeof vi.fn>;
let findByID: ReturnType<typeof vi.fn>;
let sql: ReturnType<typeof vi.fn>;
const context = () => run.turnContext as ChatRunContext;
const readCall = (callID = "read1", pageID = "19") =>
  parsePageDiscoveryCall({ callID, name: "pages_read", arguments: { pageID } });
const execute = (call = readCall()) =>
  executePageDiscovery(req, options, "7", "1", call);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv(
    "REALIZE_PAGE_DISCOVERY_TEST_TOKEN",
    "private-test-key-never-used-by-runtime",
  );
  run = {
    id: 7,
    conversation: 2,
    requestedBy: 1,
    status: "queued",
    turnContext: {
      pageDiscoveryEnabled: true,
      runtimeContextHash: "hash",
      attachments: [],
      projectFiles: [],
      webSearch: false,
    },
  };
  find = vi.fn(async () => ({
    docs: [{ id: 19, title: "Доставка", slug: "delivery", secret: "omitted" }],
    page: 1,
    totalDocs: 1,
    totalPages: 1,
  }));
  findByID = vi.fn(async ({ collection }) =>
    collection === "users"
      ? { id: 1, roles: ["admin"] }
      : { id: 7, requestedBy: 1 },
  );
  sql = vi.fn(async () => undefined);
  const payload = {
    config: {
      serverURL: "http://localhost:3000",
      routes: { api: "/api", admin: "/manage" },
    },
    db: {
      defaultIDType: "number",
      name: "postgres",
      sessions: { tx: { db: { execute: sql } } },
    },
    find,
    findByID,
  } as unknown as Payload;
  req = {
    payload,
    user: { id: 1, collection: "users", roles: ["admin"] },
    transactionID: "tx",
    headers: new Headers({ host: "attacker.example" }),
  } as unknown as PayloadRequest;
  mocks.runStatus.mockResolvedValue("running");
  mocks.currentOptions.mockResolvedValue(options);
  mocks.createPlan.mockResolvedValue({ id: 91 });
  vi.spyOn(AIRepository.prototype, "getRun").mockImplementation(
    async () => run,
  );
  vi.spyOn(
    AIRepository.prototype,
    "requireOwnedConversation",
  ).mockResolvedValue({ id: 2, status: "active" });
  vi.spyOn(AIRepository.prototype, "updateRun").mockImplementation(
    async (_id, data) => {
      run = { ...run, ...data };
      return run;
    },
  );
  vi.spyOn(PageDraftUpdate.prototype, "readContext").mockResolvedValue(
    snapshot,
  );
});

describe("page discovery grant and actor", () => {
  it("binds run and actor for 15 minutes using the configured endpoint", () => {
    const grant = createPageDiscoveryGrant(req.payload, options, "7", "1");
    expect(grant.endpoint).toBe(
      "http://localhost:3000/api/realize-ai/chat/page-tools/7",
    );
    const claims = verifyPageDiscoveryGrant(grant.token, "7", options);
    expect(claims.userID).toBe("1");
    expect(claims.expiresAt - claims.issuedAt).toBe(900_000);
    expect(() => verifyPageDiscoveryGrant(grant.token, "8", options)).toThrow(
      "недействителен",
    );
    expect(() =>
      verifyPageDiscoveryGrant(`${grant.token.slice(0, -3)}abc`, "7", options),
    ).toThrow("недействителен");
    vi.spyOn(Date, "now").mockReturnValue(claims.expiresAt);
    expect(() => verifyPageDiscoveryGrant(grant.token, "7", options)).toThrow(
      "истёк",
    );
  });
  it("rejects a grant after shared-key rotation", () => {
    const grant = createPageDiscoveryGrant(req.payload, options, "7", "1");
    vi.stubEnv("REALIZE_PAGE_DISCOVERY_TEST_TOKEN", "new-test-key");
    expect(() => verifyPageDiscoveryGrant(grant.token, "7", options)).toThrow();
  });
  it("rebuilds actor from persisted identity instead of callback cookie or request Host", async () => {
    const grant = createPageDiscoveryGrant(req.payload, options, "7", "1");
    const actor = await authorizePageDiscovery(
      { ...req, user: { id: 99 } } as PayloadRequest,
      options,
      "7",
      grant.token,
    );
    expect(actor.req.user?.id).toBe(1);
    expect(actor.userID).toBe("1");
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "users",
        id: "1",
        overrideAccess: true,
      }),
    );
  });
  it("rejects wrong persisted actor before exposing a page", async () => {
    const grant = createPageDiscoveryGrant(req.payload, options, "7", "1");
    findByID.mockResolvedValue({ id: 7, requestedBy: 99 });
    await expect(
      authorizePageDiscovery(req, options, "7", grant.token),
    ).rejects.toMatchObject({ status: 403 });
    expect(find).not.toHaveBeenCalled();
  });
  it.each(["disabled", "data_denied", "chat_denied"])(
    "checks current access for every callback: %s",
    async (mode) => {
      const grant = createPageDiscoveryGrant(req.payload, options, "7", "1");
      mocks.currentOptions.mockResolvedValue({
        ...options,
        enabled: mode !== "disabled",
        access: {
          canManageData: () => mode !== "data_denied",
          canUseChat: () => mode !== "chat_denied",
        },
      });
      await expect(
        authorizePageDiscovery(req, options, "7", grant.token),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
});

describe("page discovery reads", () => {
  it("passes model query unchanged to Payload and returns only safe references with editor links", async () => {
    const result = await execute(
      parsePageDiscoveryCall({
        callID: "search1",
        name: "pages_search",
        arguments: { query: "доставка" },
      }),
    );
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "pages",
        draft: true,
        depth: 0,
        limit: 20,
        overrideAccess: false,
        req,
        where: {
          or: [
            { title: { contains: "доставка" } },
            { slug: { contains: "доставка" } },
          ],
        },
      }),
    );
    expect(result).toEqual({
      page: 1,
      totalDocs: 1,
      totalPages: 1,
      pages: [
        {
          id: "19",
          title: "Доставка",
          slug: "delivery",
          adminUrl: "/manage/collections/pages/19",
        },
      ],
    });
    expect(context().pageReadContexts).toBeUndefined();
    expect(context().pageDiscoveryCalls?.[0].status).toBe("completed");
  });
  it("allows a model-supplied alternative query without extracting it from the chat prompt", async () => {
    await execute(
      parsePageDiscoveryCall({
        callID: "search2",
        name: "pages_search",
        arguments: { query: "delivery", page: 2 },
      }),
    );
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        where: {
          or: [
            { title: { contains: "delivery" } },
            { slug: { contains: "delivery" } },
          ],
        },
      }),
    );
  });
  it("persists the exact snapshot before returning and preserves the original selection", async () => {
    context().pageDraftContext = {
      ...snapshot,
      page: { id: "20", title: "Контакты" },
    };
    expect(await execute()).toEqual(snapshot);
    expect(context().pageReadContexts?.[0].context).toEqual(snapshot);
    expect(context().pageDraftContext?.page.id).toBe("20");
    expect(sql).toHaveBeenCalledWith(
      expect.stringMatching(/^SELECT pg_advisory_xact_lock\(-?\d+, -?\d+\)$/),
    );
    expect(matchesPageDiscoveryContext(context(), intent)).toBe(true);
  });
  it("replays an identical read with the original snapshot and checks page ACL again", async () => {
    await execute();
    vi.mocked(PageDraftUpdate.prototype.readContext).mockResolvedValue({
      ...snapshot,
      fingerprint: "d".repeat(64),
    });
    expect(await execute()).toEqual(snapshot);
    expect(context().pageReadContexts).toHaveLength(1);
    vi.mocked(PageDraftUpdate.prototype.readContext).mockRejectedValue(
      new EndpointError("FORBIDDEN", "revoked", 403),
    );
    await expect(execute()).rejects.toMatchObject({ status: 403 });
  });
  it("rejects changed arguments under a previous call ID", async () => {
    await execute();
    await expect(execute(readCall("read1", "20"))).rejects.toMatchObject({
      status: 409,
    });
    expect(context().pageReadContexts).toHaveLength(1);
  });
  it("rejects pending duplicate and preserves failed calls in the budget", async () => {
    const call = readCall();
    context().pageDiscoveryCalls = [
      {
        callID: call.callID,
        name: call.name,
        requestHash: hashCanonicalJSON({
          name: call.name,
          arguments: call.arguments,
        }),
        status: "pending",
      },
    ];
    await expect(execute()).rejects.toMatchObject({ status: 409 });
    vi.mocked(PageDraftUpdate.prototype.readContext).mockRejectedValue(
      new EndpointError("FORBIDDEN", "denied", 403),
    );
    await expect(execute(readCall("read2"))).rejects.toMatchObject({
      status: 403,
    });
    expect(context().pageDiscoveryCalls?.[1].status).toBe("failed");
    expect(context().pageReadContexts).toBeUndefined();
  });
  it("bounds a run to 12 calls including failures", async () => {
    context().pageDiscoveryCalls = Array.from({ length: 12 }, (_, n) => ({
      callID: `old${n}`,
      name: "pages_read",
      requestHash: "a".repeat(64),
      status: "failed",
    }));
    await expect(execute()).rejects.toMatchObject({ status: 429 });
    expect(PageDraftUpdate.prototype.readContext).not.toHaveBeenCalled();
  });
  it("bounds a run to three persisted page snapshots", async () => {
    await execute(readCall("one"));
    await execute(readCall("two"));
    await execute(readCall("three"));
    await expect(execute(readCall("four"))).rejects.toMatchObject({
      status: 429,
    });
    expect(context().pageReadContexts).toHaveLength(3);
    expect(context().pageDiscoveryCalls?.[3].status).toBe("failed");
  });
  it("forwards the exact structure revision and rejects a stale continuation without creating a text snapshot", async () => {
    const read = vi
      .spyOn(PageDraftUpdate.prototype, "readStructure")
      .mockRejectedValue(
        new EndpointError("CONFLICT", "Страница изменилась", 409),
      );
    const request = {
      offset: 32,
      fingerprint: snapshot.fingerprint,
      catalogHash: "a".repeat(64),
    };
    await expect(
      execute(
        parsePageDiscoveryCall({
          callID: "structure1",
          name: "pages_structure",
          arguments: { pageID: "19", ...request },
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(read).toHaveBeenCalledWith("19", request);
    expect(context().pageReadContexts).toBeUndefined();
    expect(context().pageDiscoveryCalls?.[0].status).toBe("failed");
  });
  it.each(["completed", "failed", "cancelled"])(
    "rejects a terminal CP run without relying on SSE: %s",
    async (status) => {
      mocks.runStatus.mockResolvedValue(status);
      await expect(execute()).rejects.toMatchObject({ status: 409 });
      expect(PageDraftUpdate.prototype.readContext).not.toHaveBeenCalled();
    },
  );
  it("rejects a terminal database projection before contacting the control plane", async () => {
    run.status = "completed";
    await expect(execute()).rejects.toMatchObject({ status: 409 });
    expect(mocks.runStatus).not.toHaveBeenCalled();
  });
  it("does not record or return a read if the run terminates before persistence", async () => {
    mocks.runStatus
      .mockResolvedValueOnce("running")
      .mockResolvedValueOnce("cancelled");
    await expect(execute()).rejects.toMatchObject({ status: 409 });
    expect(context().pageReadContexts).toBeUndefined();
    expect(context().pageDiscoveryCalls?.[0].status).toBe("failed");
  });
  it.each(["actor", "tools", "workflow", "archived"])(
    "rejects a run outside its current authority: %s",
    async (mode) => {
      if (mode === "actor") run.requestedBy = 99;
      if (mode === "tools") context().pageDiscoveryEnabled = false;
      if (mode === "workflow") context().workflow = {} as never;
      if (mode === "archived")
        vi.mocked(
          AIRepository.prototype.requireOwnedConversation,
        ).mockResolvedValue({ id: 2, status: "archived" });
      await expect(execute()).rejects.toMatchObject({
        status: mode === "archived" ? 409 : 403,
      });
      expect(find).not.toHaveBeenCalled();
    },
  );
});

describe("page discovery to data plan", () => {
  it("accepts the persisted current-run tool read and rejects another run or altered content", async () => {
    await execute();
    vi.spyOn(AIRepository.prototype, "getConversationDetail").mockResolvedValue(
      {
        conversation: { id: 2 },
        runs: [],
        messages: [
          { id: 4, role: "user", sequence: 1 },
          {
            id: 5,
            role: "assistant",
            sequence: 2,
            runID: "7",
            content: `\`\`\`realize-data-operation\n${JSON.stringify(intent)}\n\`\`\``,
          },
        ],
      },
    );
    vi.spyOn(
      DataOperationRepository.prototype,
      "findByIdempotencyKey",
    ).mockResolvedValue(undefined);
    vi.spyOn(
      DataOperationRepository.prototype,
      "findBySourceMessage",
    ).mockResolvedValue(undefined);
    const input = {
      req,
      payload: req.payload,
      userID: 1,
      conversationID: "2",
      sourceMessageID: "5",
      idempotencyKey: "plan-one",
    };
    await expect(createDataOperationPlan(input)).resolves.toEqual({ id: 91 });
    context().pageReadContexts![0].context = {
      ...snapshot,
      fingerprint: "d".repeat(64),
    };
    await expect(createDataOperationPlan(input)).rejects.toMatchObject({
      status: 409,
    });
    run.conversation = 3;
    await expect(createDataOperationPlan(input)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("requires a completed server ledger entry and exact before text", async () => {
    await execute();
    expect(
      matchesPageDiscoveryContext(context(), {
        ...intent,
        changes: [{ ...intent.changes[0], before: "Придуманный текст" }],
      }),
    ).toBe(false);
    context().pageDiscoveryCalls![0].status = "pending";
    expect(matchesPageDiscoveryContext(context(), intent)).toBe(false);
    context().pageDiscoveryCalls = [];
    expect(matchesPageDiscoveryContext(context(), intent)).toBe(false);
  });
});
