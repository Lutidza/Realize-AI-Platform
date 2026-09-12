// @vitest-environment node
/**
 * @file tests/int/workflowDataLane.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Проверяет реальные planning/check owners workflow с изолированным Payload Local API.
 */
import type {
  AIConfigArtifact,
  AssignProductCategoryIntent,
} from "@realize/ai-contracts";
import {
  compileAgentConfiguration,
  SYSTEM_AI_CONFIG_PROJECTION,
} from "@realize/change-engine";
import type { Payload, PayloadRequest } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_CONFIG_ARTIFACTS,
  createAIConfigDraftFixture,
  createAIConfigReleaseFixture,
} from "./fixtures/aiConfiguration";
import { createDataOperationPlan } from "../../packages/payload-ai-plugin/src/endpoints/dataOperationPlanning";
import { executeWorkflowCapability } from "../../packages/payload-ai-plugin/src/endpoints/executeWorkflowCapability.service";
import { executeWorkflowCheck } from "../../packages/payload-ai-plugin/src/endpoints/executeWorkflowCheck.service";
import { requireCodexChatTool } from "../../packages/payload-ai-plugin/src/endpoints/requireCodexChatTool.service";
import type { AIDocument } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";

vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/requireCodexChatTool.service",
  () => ({ requireCodexChatTool: vi.fn() }),
);
vi.mock(
  "../../packages/payload-ai-plugin/src/endpoints/payloadTransaction",
  () => ({
    withPayloadTransaction: async (
      _req: unknown,
      work: () => Promise<unknown>,
    ) => await work(),
  }),
);

const intent: AssignProductCategoryIntent = {
  category: { slug: "accessories" },
  product: { slug: "watch" },
  kind: "catalog.assignCategory.v1",
  version: "1.0",
};
const configuration = (
  narrowReadScopes = false,
  system = SYSTEM_AI_CONFIG_PROJECTION,
) => {
  const artifacts: AIConfigArtifact[] = AI_CONFIG_ARTIFACTS.map((artifact) =>
    artifact.kind === "capability_binding"
      ? {
          ...artifact,
          readScopes: narrowReadScopes
            ? ["payload.products"]
            : ["payload.products", "payload.categories"],
        }
      : artifact.kind === "agent_profile"
        ? {
            ...artifact,
            checkBindingKeys: SYSTEM_AI_CONFIG_PROJECTION.checkIDs.map(
              (id) => `check-${id}`,
            ),
          }
        : artifact,
  );
  artifacts.push(
    ...SYSTEM_AI_CONFIG_PROJECTION.checkIDs.map((id): AIConfigArtifact => ({
      kind: "check_binding",
      key: `check-${id}`,
      checkID: id,
      enabled: true,
      revision: 1,
      title: id,
    })),
  );
  const release = createAIConfigReleaseFixture(
    createAIConfigDraftFixture(artifacts),
  );
  return {
    schemaVersion: "1.0" as const,
    pointerVersion: 1,
    releaseVersion: 1,
    compiled: compileAgentConfiguration({
      release,
      system,
      profileKey: "admin",
    }),
  };
};

const matches = (
  document: AIDocument,
  where: Record<string, unknown>,
): boolean =>
  Object.entries(where).every(([key, value]) => {
    if (key === "and")
      return (value as Record<string, unknown>[]).every((item) =>
        matches(document, item),
      );
    const clause = value as { equals?: unknown; in?: unknown[] };
    if (clause.in) return clause.in.map(String).includes(String(document[key]));
    return String(document[key]) === String(clause.equals);
  });

const fixture = () => {
  const records: Record<string, AIDocument[]> = {
    "realize-ai-conversations": [{ id: 4, createdBy: 1, status: "active" }],
    "realize-ai-messages": [
      {
        id: 9,
        conversation: 4,
        role: "user",
        runID: "50",
        sequence: 1,
        content: "Добавь категорию",
      },
      {
        id: 10,
        conversation: 4,
        role: "assistant",
        runID: "50",
        sequence: 2,
        content: `Предлагаю изменение.\n\`\`\`realize-data-operation\n${JSON.stringify(intent)}\n\`\`\``,
      },
    ],
    "realize-ai-runs": [{ id: 50, conversation: 4 }],
    "realize-ai-data-operations": [],
    "realize-ai-data-operation-events": [],
    products: [
      {
        id: 7,
        slug: "watch",
        title: "Часы",
        categories: [],
        updatedAt: "2026-09-11T00:00:00.000Z",
      },
    ],
    categories: [
      { id: 11, slug: "accessories", title: "Аксессуары" },
      { id: 12, slug: "sale", title: "Скидки" },
    ],
  };
  let nextID = 100;
  const find = vi.fn(async (args: Record<string, unknown>) => {
    const selected = (records[String(args.collection)] ?? []).filter((record) =>
      matches(record, args.where as Record<string, unknown>),
    );
    return {
      docs: selected.slice(0, Number(args.limit ?? 100)),
      totalDocs: selected.length,
    };
  });
  const create = vi.fn(async (args: Record<string, unknown>) => {
    const collection = String(args.collection);
    const document: AIDocument = {
      ...(args.data as Record<string, unknown>),
      id: nextID++,
    };
    const values = (records[collection] ??= []);
    if (
      values.some(
        (item) =>
          item.idempotencyKey === document.idempotencyKey ||
          (document.sourceMessageKey &&
            item.sourceMessageKey === document.sourceMessageKey),
      )
    )
      throw new Error("unique constraint");
    values.push(document);
    return document;
  });
  const update = vi.fn();
  const payload = {
    db: { defaultIDType: "number" },
    find,
    create,
    update,
  } as unknown as Payload;
  const req = { payload, user: { id: 1 } } as PayloadRequest;
  const options = {
    access: {
      canUseChat: vi.fn().mockResolvedValue(true),
      canManageData: vi.fn().mockResolvedValue(true),
    },
  } as unknown as SanitizedRealizeAIPluginOptions;
  const base = {
    req,
    options,
    userID: 1,
    conversationID: "4",
    rootRunID: "50",
    configuration: configuration(),
  };
  const capability = {
    ...base,
    sourceMessageID: "9",
    stepKey: "change",
    capabilityBindingKey: "catalog-category",
    input: intent,
  };
  return { records, find, create, update, req, options, base, capability };
};

beforeEach(() => vi.mocked(requireCodexChatTool).mockReset());

describe("workflow capability governed planning", () => {
  it("creates a real preview plus audit from the original user and never applies data", async () => {
    const test = fixture();
    const result = await executeWorkflowCapability(test.capability);
    expect(result.output).toEqual({
      dataOperationID: "100",
      state: "awaiting_approval",
      operationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(result.lastCapability).toEqual({
      dataOperationID: "100",
      stepKey: "change",
      operationHash: result.output.operationHash,
    });
    expect(test.records["realize-ai-data-operations"][0]).toMatchObject({
      sourceMessage: 9,
      sourceMessageKey: expect.stringMatching(/^workflow:/),
      beforeSnapshot: [],
      afterSnapshot: [{ id: "11", slug: "accessories", title: "Аксессуары" }],
      state: "awaiting_approval",
    });
    expect(test.records["realize-ai-data-operation-events"][0]).toMatchObject({
      type: "preview_created",
      payload: {
        workflow: {
          rootRunID: "50",
          stepKey: "change",
          requestHash: expect.any(String),
        },
      },
    });
    expect(test.records.products[0].categories).toEqual([]);
    expect(test.update).not.toHaveBeenCalled();
    expect(test.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "products",
        overrideAccess: false,
      }),
    );
    expect(requireCodexChatTool).toHaveBeenCalledWith(
      test.req,
      "dataOperations",
      test.options,
    );
  });

  it("replays exact root/step without another preview and rejects changed input", async () => {
    const test = fixture();
    const first = await executeWorkflowCapability(test.capability);
    await expect(executeWorkflowCapability(test.capability)).resolves.toEqual(
      first,
    );
    await expect(
      executeWorkflowCapability({
        ...test.capability,
        input: { ...intent, category: { slug: "sale" } },
      }),
    ).rejects.toThrow("другим запросом");
    expect(test.records["realize-ai-data-operations"]).toHaveLength(1);
    expect(test.records["realize-ai-data-operation-events"]).toHaveLength(1);
  });

  it("allows two different capability steps to refer to the same original user message", async () => {
    const test = fixture();
    await executeWorkflowCapability(test.capability);
    await executeWorkflowCapability({
      ...test.capability,
      stepKey: "second",
      input: { ...intent, category: { slug: "sale" } },
    });
    expect(test.records["realize-ai-data-operations"]).toHaveLength(2);
    expect(
      new Set(
        test.records["realize-ai-data-operations"].map(
          (item) => item.sourceMessageKey,
        ),
      ).size,
    ).toBe(2);
  });

  it("deduplicates simultaneous executions of the same capability step", async () => {
    const test = fixture();
    const results = await Promise.all([
      executeWorkflowCapability(test.capability),
      executeWorkflowCapability(test.capability),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(test.records["realize-ai-data-operations"]).toHaveLength(1);
    expect(test.records["realize-ai-data-operation-events"]).toHaveLength(1);
  });

  it("resolves the exact original request after more than 200 earlier messages", async () => {
    const test = fixture();
    test.records["realize-ai-messages"].unshift(
      ...Array.from({ length: 220 }, (_, index) => ({
        id: 1000 + index,
        conversation: 4,
        role: "user",
        runID: String(1000 + index),
        sequence: index + 1,
        content: "Ранее",
      })),
    );
    await expect(
      executeWorkflowCapability(test.capability),
    ).resolves.toMatchObject({ output: { state: "awaiting_approval" } });
    expect(test.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "realize-ai-messages", limit: 1 }),
    );
  });

  it("refuses an internally valid historical snapshot whose system ceiling changed", async () => {
    const test = fixture();
    const historical = configuration(false, {
      ...SYSTEM_AI_CONFIG_PROJECTION,
      version: "1.0.1",
      manifestHash: "b".repeat(64),
    });
    await expect(
      executeWorkflowCapability({
        ...test.capability,
        configuration: historical,
      }),
    ).rejects.toThrow("Системная политика изменилась");
    expect(test.create).not.toHaveBeenCalled();
  });

  it("rechecks current data permission and tool settings even for an existing preview", async () => {
    const test = fixture();
    await executeWorkflowCapability(test.capability);
    vi.mocked(test.options.access.canManageData).mockResolvedValueOnce(false);
    await expect(executeWorkflowCapability(test.capability)).rejects.toThrow(
      "management is not permitted",
    );
    vi.mocked(requireCodexChatTool).mockRejectedValueOnce(
      new Error("dataOperations disabled"),
    );
    await expect(executeWorkflowCapability(test.capability)).rejects.toThrow(
      "disabled",
    );
    expect(test.records["realize-ai-data-operations"]).toHaveLength(1);
  });

  it("rejects insufficient scopes, unselected binding and malformed typed intent before writes", async () => {
    const test = fixture();
    await expect(
      executeWorkflowCapability({
        ...test.capability,
        configuration: configuration(true),
      }),
    ).rejects.toThrow("Ограничения");
    await expect(
      executeWorkflowCapability({
        ...test.capability,
        capabilityBindingKey: "missing",
      }),
    ).rejects.toThrow("не входит");
    await expect(
      executeWorkflowCapability({
        ...test.capability,
        input: { ...intent, sql: "UPDATE products" },
      }),
    ).rejects.toThrow();
    expect(test.create).not.toHaveBeenCalled();
  });

  it("rejects foreign owner, conversation, assistant source and unrelated root", async () => {
    const test = fixture();
    await expect(
      executeWorkflowCapability({ ...test.capability, userID: 2 }),
    ).rejects.toThrow("пользователем");
    await expect(
      executeWorkflowCapability({ ...test.capability, conversationID: "5" }),
    ).rejects.toThrow();
    await expect(
      executeWorkflowCapability({ ...test.capability, sourceMessageID: "10" }),
    ).rejects.toThrow("источник");
    await expect(
      executeWorkflowCapability({ ...test.capability, rootRunID: "51" }),
    ).rejects.toThrow("исходному запуску");
    expect(test.create).not.toHaveBeenCalled();
  });

  it("keeps legacy assistant-only creation, source dedup and original sourceMessageKey", async () => {
    const test = fixture();
    const input = {
      ...test.base,
      payload: test.req.payload,
      idempotencyKey: "legacy-key",
      sourceMessageID: "10",
    };
    const first = await createDataOperationPlan(input);
    expect(first.sourceMessageKey).toBe("4:10");
    await expect(
      createDataOperationPlan({ ...input, idempotencyKey: "different-key" }),
    ).resolves.toEqual(first);
    await expect(
      createDataOperationPlan({ ...input, sourceMessageID: "9" }),
    ).rejects.toThrow("persisted assistant");
    expect(test.records["realize-ai-data-operations"]).toHaveLength(1);
  });
});

describe("workflow checks use actual operation evidence", () => {
  it("checks the current user permission and selected check before reading operation evidence", async () => {
    const test = fixture();
    const result = await executeWorkflowCapability(test.capability);
    const input = {
      ...test.base,
      checkBindingKey: "payload-access",
      lastCapability: result.lastCapability,
    };
    await expect(
      executeWorkflowCheck({ ...input, checkBindingKey: "unselected" }),
    ).rejects.toThrow("системный реестр");
    vi.mocked(test.options.access.canManageData).mockResolvedValueOnce(false);
    await expect(executeWorkflowCheck(input)).rejects.toThrow(
      "management is not permitted",
    );
    vi.mocked(requireCodexChatTool).mockRejectedValueOnce(
      new Error("disabled"),
    );
    await expect(executeWorkflowCheck(input)).rejects.toThrow("disabled");
    expect(test.update).not.toHaveBeenCalled();
  });
  it.each(SYSTEM_AI_CONFIG_PROJECTION.checkIDs)(
    "executes %s against current accessible selectors and immutable preview",
    async (checkID) => {
      const test = fixture();
      const result = await executeWorkflowCapability(test.capability);
      const before = test.find.mock.calls.length;
      await expect(
        executeWorkflowCheck({
          ...test.base,
          checkBindingKey: `check-${checkID}`,
          lastCapability: result.lastCapability,
        }),
      ).resolves.toEqual({
        checkID,
        status: "passed",
        dataOperationID: "100",
        operationHash: result.output.operationHash,
        evidenceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(test.find.mock.calls.slice(before)).toEqual(
        expect.arrayContaining([
          [
            expect.objectContaining({
              collection: "products",
              overrideAccess: false,
            }),
          ],
          [
            expect.objectContaining({
              collection: "categories",
              overrideAccess: false,
            }),
          ],
        ]),
      );
      expect(test.update).not.toHaveBeenCalled();
    },
  );

  it("blocks a check without explicit capability context or without audit evidence", async () => {
    const test = fixture();
    const input = { ...test.base, checkBindingKey: "payload-access" };
    await expect(executeWorkflowCheck(input)).rejects.toThrow(
      "предыдущего шага",
    );
    const result = await executeWorkflowCapability(test.capability);
    test.records["realize-ai-data-operation-events"] = [];
    await expect(
      executeWorkflowCheck({ ...input, lastCapability: result.lastCapability }),
    ).rejects.toThrow("audit");
  });

  it.each([
    "rejected",
    "applied",
    "approved",
    "expired",
    "changed-target",
    "missing-target",
    "ambiguous-selector",
    "wrong-root",
    "wrong-conversation",
    "wrong-hash",
  ])("blocks stale or unrelated context: %s", async (mutation) => {
    const test = fixture();
    const result = await executeWorkflowCapability(test.capability);
    const operation = test.records["realize-ai-data-operations"][0];
    const input = {
      ...test.base,
      checkBindingKey: "payload-access",
      lastCapability: result.lastCapability,
    };
    if (["rejected", "applied", "approved"].includes(mutation))
      operation.state = mutation;
    if (mutation === "expired") operation.expiresAt = "2020-01-01T00:00:00Z";
    if (mutation === "changed-target")
      test.records.products[0].updatedAt = "2026-09-11T00:00:01.000Z";
    if (mutation === "missing-target") test.records.products = [];
    if (mutation === "ambiguous-selector")
      test.records.products.push({ ...test.records.products[0], id: 8 });
    if (mutation === "wrong-root") input.rootRunID = "51";
    if (mutation === "wrong-conversation") input.conversationID = "5";
    if (mutation === "wrong-hash")
      input.lastCapability.operationHash = "a".repeat(64);
    await expect(executeWorkflowCheck(input)).rejects.toThrow();
    expect(test.update).not.toHaveBeenCalled();
  });
});
