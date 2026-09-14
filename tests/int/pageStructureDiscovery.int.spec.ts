// @vitest-environment node
/**
 * @file tests/int/pageStructureDiscovery.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет durable порции структуры, replay и общий бюджет снимков одного запуска.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Payload, PayloadRequest } from "payload";
import {
  parsePageDiscoveryCall,
  parsePageDraftContext,
  parsePageStructureContext,
  type PageStructureContextDTO,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import { executePageDiscovery } from "../../packages/payload-ai-plugin/src/chat-context/pageDiscovery.service";
import type { ChatRunContext } from "../../packages/payload-ai-plugin/src/chat-context/ChatRunContext.types";
import { PageDraftUpdate } from "../../packages/payload-ai-plugin/src/endpoints/pageDraftUpdate.service";
import {
  AIRepository,
  type AIDocument,
} from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { EndpointError } from "../../packages/payload-ai-plugin/src/endpoints/http";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";
import { pageKnowledgeAdapter } from "../../src/collections/Pages/pageKnowledge.adapter";
import { Pages } from "../../src/collections/Pages";

const mocks = vi.hoisted(() => ({ runStatus: vi.fn() }));
vi.mock(
  "../../packages/payload-ai-plugin/src/runtime/getControlPlaneClient",
  () => ({ getControlPlaneClient: () => ({ runStatus: mocks.runStatus }) }),
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
const structure = (large = false): PageStructureContextDTO => {
  const definitions = pageKnowledgeAdapter
    .definitions(Pages.fields)
    .filter((definition) =>
      ["pages", "blocks.content"].includes(definition.id),
    );
  if (large)
    definitions.forEach((definition) => {
      definition.guide.instructions = Array.from({ length: 8 }, () =>
        "и".repeat(850),
      );
    });
  return parsePageStructureContext({
    page: { id: "19", title: "Доставка" },
    updatedAt: "2026-09-13T09:00:00.000Z",
    fingerprint: "c".repeat(64),
    knowledge: {
      version: "1.0",
      pageID: "19",
      fingerprint: "c".repeat(64),
      catalogHash: hashCanonicalJSON(definitions),
      definitions,
      outline: pageKnowledgeAdapter.outline(
        {
          layout: Array.from({ length: large ? 32 : 3 }, (_, i) => ({
            id: `block${i}`,
            blockType: "content",
            columns: [],
          })),
        },
        0,
      ),
    },
  });
};
const options = {} as SanitizedRealizeAIPluginOptions;
let run: AIDocument;
let req: PayloadRequest;
const context = () => run.turnContext as ChatRunContext;
const call = (callID = "structure-one", pageID = "19") =>
  parsePageDiscoveryCall({
    callID,
    name: "pages_structure",
    arguments: { pageID },
  });
const execute = (request = call()) =>
  executePageDiscovery(req, options, "7", "1", request);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  run = {
    id: 7,
    conversation: 2,
    requestedBy: 1,
    status: "running",
    turnContext: {
      pageDiscoveryEnabled: true,
      runtimeContextHash: "fixture",
      attachments: [],
      projectFiles: [],
      webSearch: false,
    },
  };
  const payload = {
    db: {
      name: "postgres",
      sessions: { tx: { db: { execute: vi.fn(async () => {}) } } },
    },
  } as unknown as Payload;
  req = { payload, user: { id: 1 }, transactionID: "tx" } as PayloadRequest;
  mocks.runStatus.mockResolvedValue("running");
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
  vi.spyOn(PageDraftUpdate.prototype, "readStructure").mockResolvedValue(
    structure(),
  );
});

describe("Журнал порций структуры Pages", () => {
  it("сохраняет точную порцию и аргументы вместе с completed вызовом до возврата", async () => {
    const result = await execute();
    expect(context().pageStructureReadContexts).toEqual([
      {
        callID: "structure-one",
        requestHash: hashCanonicalJSON({
          name: "pages_structure",
          arguments: { pageID: "19" },
        }),
        arguments: { pageID: "19" },
        context: result,
      },
    ]);
    expect(context().pageDiscoveryCalls?.[0].status).toBe("completed");
    expect(context().pageReadContexts).toBeUndefined();
  });
  it("не возвращает инструменту результат, пока snapshot не сохранён", async () => {
    let release!: () => void;
    let reached!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const completionReached = new Promise<void>((resolve) => {
      reached = resolve;
    });
    vi.mocked(AIRepository.prototype.updateRun).mockImplementation(
      async (_id, data) => {
        if (
          (data.turnContext as ChatRunContext).pageStructureReadContexts?.length
        ) {
          reached();
          await blocked;
        }
        run = { ...run, ...data };
        return run;
      },
    );
    let returned = false;
    const response = execute().then((result) => {
      returned = true;
      return result;
    });
    await completionReached;
    expect(returned).toBe(false);
    expect(context().pageStructureReadContexts).toBeUndefined();
    expect(context().pageDiscoveryCalls?.[0].status).toBe("pending");
    release();
    await response;
    expect(context().pageDiscoveryCalls?.[0].status).toBe("completed");
  });
  it("exact replay перечитывает ту же порцию с ревизией и не создаёт второй snapshot", async () => {
    const snapshot = await execute();
    expect(await execute()).toEqual(snapshot);
    expect(PageDraftUpdate.prototype.readStructure).toHaveBeenLastCalledWith(
      "19",
      {
        offset: 0,
        fingerprint: structure().fingerprint,
        catalogHash: structure().knowledge.catalogHash,
      },
    );
    expect(context().pageStructureReadContexts).toHaveLength(1);
    expect(context().pageDiscoveryCalls).toHaveLength(1);
  });
  it.each(["acl", "snapshot", "different-arguments", "pending", "terminal"])(
    "не возвращает snapshot по недействительному replay: %s",
    async (reason) => {
      await execute();
      if (reason === "acl")
        vi.mocked(PageDraftUpdate.prototype.readStructure).mockRejectedValue(
          new EndpointError("FORBIDDEN", "Доступ отозван", 403),
        );
      if (reason === "snapshot") {
        const changed = structure();
        changed.page.title = "Изменено";
        vi.mocked(PageDraftUpdate.prototype.readStructure).mockResolvedValue(
          changed,
        );
      }
      if (reason === "pending")
        context().pageDiscoveryCalls![0].status = "pending";
      if (reason === "terminal") mocks.runStatus.mockResolvedValue("completed");
      await expect(
        execute(
          reason === "different-arguments"
            ? call("structure-one", "20")
            : call(),
        ),
      ).rejects.toMatchObject({ status: reason === "acl" ? 403 : 409 });
      expect(context().pageStructureReadContexts).toHaveLength(1);
    },
  );
  it("ограничивает число сохранённых порций восемью, включая повторные новые call IDs", async () => {
    for (let i = 0; i < 8; i++) await execute(call(`portion${i}`));
    await expect(execute(call("portion8"))).rejects.toMatchObject({
      status: 429,
    });
    expect(context().pageStructureReadContexts).toHaveLength(8);
    expect(context().pageDiscoveryCalls?.[8]).toMatchObject({
      callID: "portion8",
      status: "failed",
    });
  });
  it("text snapshots и structural portions делят один 384 KiB budget", async () => {
    const largeText = parsePageDraftContext({
      page: { id: "19", title: "Доставка" },
      updatedAt: structure().updatedAt,
      fingerprint: structure().fingerprint,
      adapterVersion: "1.0",
      fields: Array.from({ length: 16 }, (_, i) => ({
        path: `/layout/${i}/columns/0/richText/root/children/0/children/0/text`,
        label: `Абзац ${i}`,
        value: "x".repeat(3500),
        maxLength: 4000,
      })),
    });
    vi.spyOn(PageDraftUpdate.prototype, "readContext").mockResolvedValue(
      largeText,
    );
    for (let i = 0; i < 3; i++)
      await execute(
        parsePageDiscoveryCall({
          callID: `text${i}`,
          name: "pages_read",
          arguments: { pageID: "19" },
        }),
      );
    vi.mocked(PageDraftUpdate.prototype.readStructure).mockResolvedValue(
      structure(true),
    );
    let rejected = false;
    for (let i = 0; i < 8; i++) {
      try {
        await execute(call(`large${i}`));
      } catch (error) {
        expect(error).toMatchObject({ status: 429 });
        rejected = true;
        break;
      }
    }
    expect(rejected).toBe(true);
    expect(context().pageReadContexts).toHaveLength(3);
    expect(context().pageStructureReadContexts!.length).toBeLessThan(8);
    expect(
      Buffer.byteLength(
        JSON.stringify([
          context().pageReadContexts,
          context().pageStructureReadContexts,
        ]),
        "utf8",
      ),
    ).toBeLessThanOrEqual(384 * 1024);
    expect(context().pageDiscoveryCalls!.at(-1)?.status).toBe("failed");
  });
  it("не сохраняет snapshot, если run закончился до durable completion", async () => {
    mocks.runStatus
      .mockResolvedValueOnce("running")
      .mockResolvedValueOnce("cancelled");
    await expect(execute()).rejects.toMatchObject({ status: 409 });
    expect(context().pageStructureReadContexts).toBeUndefined();
    expect(context().pageDiscoveryCalls?.[0].status).toBe("failed");
  });
  it("новая порция расходует общий бюджет вызовов, включая прежние failures", async () => {
    context().pageDiscoveryCalls = Array.from({ length: 12 }, (_, i) => ({
      callID: `failed${i}`,
      name: "pages_search",
      requestHash: "a".repeat(64),
      status: "failed",
    }));
    await expect(execute()).rejects.toMatchObject({ status: 429 });
    expect(PageDraftUpdate.prototype.readStructure).not.toHaveBeenCalled();
    expect(context().pageStructureReadContexts).toBeUndefined();
  });
});
