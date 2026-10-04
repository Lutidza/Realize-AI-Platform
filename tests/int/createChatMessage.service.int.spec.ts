// @vitest-environment node
/**
 * @file tests/int/createChatMessage.service.int.spec.ts
 * @version 1.4.0
 * @date 2026-09-30
 * @description Проверяет сохранение полного запроса, права вложений и идемпотентность отправки.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PayloadRequest } from "payload";
import { createChatMessage } from "../../packages/payload-ai-plugin/src/chat-context/createChatMessage.service";
import { PageDraftUpdate } from "../../packages/payload-ai-plugin/src/endpoints/pageDraftUpdate.service";
import { pageAgentManifest } from "../../src/collections/Pages/pageAgent.manifest";
import { ChatAttachmentRepository } from "../../packages/payload-ai-plugin/src/chat-context/ChatAttachment.repository";
import { AIRepository } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import { AIConfigRepository } from "../../packages/payload-ai-plugin/src/endpoints/aiConfigRepository";
import {
  createAIConfigReleaseFixture,
  createAIConfigDraftFixture,
  AI_CONFIG_ARTIFACTS,
} from "./fixtures/aiConfiguration";
import { SYSTEM_AI_CONFIG_PROJECTION } from "@realize/change-engine";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";

const client = vi.hoisted(() => ({
  startRun: vi.fn(),
  claimChatAsset: vi.fn(),
  resolveProjectFiles: vi.fn(),
  chatAssetMetadata: vi.fn(),
}));
vi.mock(
  "../../packages/payload-ai-plugin/src/runtime/getControlPlaneClient",
  () => ({ getControlPlaneClient: () => client }),
);

const req = {
  payload: { db: { defaultIDType: "number" } },
} as unknown as PayloadRequest;
const options = {
  runtime: { model: "fixture-model" },
  access: { canManageAIConfiguration: () => false },
} as unknown as SanitizedRealizeAIPluginOptions;
const attachment = {
  id: 7,
  assetID: "b0ab501b-5539-48fd-a79d-85d36c4326de",
  createdBy: 1,
  name: "photo.png",
  mimeType: "image/png",
  size: 100,
  kind: "image" as const,
  sha256: "a".repeat(64),
  expiresAt: "2027-01-01",
};
const run = { id: 4, conversation: 2, status: "queued" };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(AIConfigRepository.prototype, "getActivePointer").mockResolvedValue(
    undefined,
  );
  client.chatAssetMetadata.mockResolvedValue({
    ...attachment,
    id: attachment.assetID,
  });
  client.startRun.mockResolvedValue(undefined);
  client.claimChatAsset.mockResolvedValue(undefined);
  client.resolveProjectFiles.mockResolvedValue([
    { path: "src/a.ts", sha256: "b".repeat(64), size: 50 },
  ]);
  vi.spyOn(AIRepository.prototype, "getConversationDetail").mockResolvedValue({
    conversation: { id: 2, status: "active" },
    messages: [],
    runs: [],
  });
  vi.spyOn(AIRepository.prototype, "findRunByIdempotencyKey").mockResolvedValue(
    undefined,
  );
  vi.spyOn(AIRepository.prototype, "getLatestThreadID").mockResolvedValue(
    "thread-fixture",
  );
  vi.spyOn(AIRepository.prototype, "createRun").mockImplementation(
    async (input) => ({ ...run, ...input }),
  );
  vi.spyOn(AIRepository.prototype, "createUserMessage").mockImplementation(
    async (input) => ({
      id: 5,
      role: "user",
      kind: "user_message",
      conversation: 2,
      ...input,
    }),
  );
  vi.spyOn(AIRepository.prototype, "touchConversation").mockResolvedValue(
    undefined,
  );
  vi.spyOn(AIRepository.prototype, "persistEvent").mockResolvedValue(true);
  vi.spyOn(AIRepository.prototype, "updateRun").mockResolvedValue(run);
  vi.spyOn(
    ChatAttachmentRepository.prototype,
    "requireOwned",
  ).mockResolvedValue(attachment);
  vi.spyOn(ChatAttachmentRepository.prototype, "link").mockResolvedValue(
    undefined,
  );
});

describe("createChatMessage", () => {
  const pageContext = {
    page: { id: "19", title: "О компании", slug: "about" },
    updatedAt: "2026-09-12T10:00:00.000Z",
    fingerprint: "c".repeat(64),
    adapterVersion: "1.0",
    fields: [
      {
        path: "/title",
        label: "Заголовок",
        value: "О компании",
        maxLength: 160,
      },
    ],
  };
  const pageInput = {
    content: "Сократи заголовок",
    pageDraft: { id: "19", fingerprint: "c".repeat(64) },
  };
  const pageReq = {
    ...req,
    user: { id: 1, collection: "users", roles: ["admin"] },
  } as unknown as PayloadRequest;
  const pageOptions = {
    ...options,
    access: { ...options.access, canManageData: () => true },
  } as unknown as SanitizedRealizeAIPluginOptions;
  it("resolves the selected CMS snapshot once and relays it without exposing content in public DTO", async () => {
    vi.spyOn(PageDraftUpdate.prototype, "readContext").mockResolvedValue(
      pageContext,
    );
    const result = await createChatMessage(
      pageReq,
      pageOptions,
      1,
      "2",
      "page",
      pageInput,
    );
    expect(PageDraftUpdate.prototype.readContext).toHaveBeenCalledWith("19");
    expect(client.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ pageDraftContext: pageContext }),
    );
    expect(AIRepository.prototype.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        turnContext: expect.objectContaining({ pageDraftContext: pageContext }),
      }),
    );
    expect(result.message?.pageDraft).toEqual(pageContext.page);
    expect(result.message).not.toHaveProperty("pageDraftContext");
    expect(result.run).not.toHaveProperty("pageDraftContext");
  });
  it("rejects stale CMS selection before creating a run or contacting the model", async () => {
    vi.spyOn(PageDraftUpdate.prototype, "readContext").mockResolvedValue({
      ...pageContext,
      fingerprint: "d".repeat(64),
    });
    await expect(
      createChatMessage(pageReq, pageOptions, 1, "2", "page", pageInput),
    ).rejects.toMatchObject({ status: 409 });
    expect(AIRepository.prototype.createRun).not.toHaveBeenCalled();
    expect(client.startRun).not.toHaveBeenCalled();
  });
  it("сохраняет knowledge в закрытом run и меняет совместимость thread при изменении описания", async () => {
    const knowledge = {
      version: "1.0" as const,
      pageID: "19",
      fingerprint: pageContext.fingerprint,
      catalogHash: "a".repeat(64),
      definitions: [{ ...pageAgentManifest, fields: [] }],
      outline: {
        offset: 0,
        limit: 32 as const,
        totalBlocks: 0,
        nextOffset: null,
        blocks: [],
      },
    };
    const read = vi
      .spyOn(PageDraftUpdate.prototype, "readContext")
      .mockResolvedValue({ ...pageContext, knowledge });
    await createChatMessage(
      pageReq,
      pageOptions,
      1,
      "2",
      "knowledge-one",
      pageInput,
    );
    const first = vi.mocked(AIRepository.prototype.createRun).mock.calls[0][0]
      .turnContext!;
    expect(first.pageDraftContext?.knowledge).toEqual(knowledge);
    expect(client.startRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pageDraftContext: { ...pageContext, knowledge },
      }),
    );
    read.mockResolvedValue({
      ...pageContext,
      knowledge: { ...knowledge, catalogHash: "b".repeat(64) },
    });
    await createChatMessage(
      pageReq,
      pageOptions,
      1,
      "2",
      "knowledge-two",
      pageInput,
    );
    const second = vi.mocked(AIRepository.prototype.createRun).mock.calls[1][0]
      .turnContext!;
    expect(second.runtimeContextHash).not.toBe(first.runtimeContextHash);
  });
  it("replays the accepted page request after the CMS changes and rejects a substituted page", async () => {
    const read = vi
      .spyOn(PageDraftUpdate.prototype, "readContext")
      .mockResolvedValue(pageContext);
    await createChatMessage(pageReq, pageOptions, 1, "2", "page", pageInput);
    const saved = vi.mocked(AIRepository.prototype.createRun).mock.calls[0][0];
    vi.mocked(AIRepository.prototype.findRunByIdempotencyKey).mockResolvedValue(
      { ...run, requestHash: saved.requestHash },
    );
    read.mockRejectedValue(new Error("changed"));
    client.startRun.mockClear();
    await expect(
      createChatMessage(pageReq, pageOptions, 1, "2", "page", pageInput),
    ).resolves.toHaveProperty("run");
    await expect(
      createChatMessage(pageReq, pageOptions, 1, "2", "page", {
        ...pageInput,
        pageDraft: { id: "20", fingerprint: "c".repeat(64) },
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(read).toHaveBeenCalledTimes(1);
    expect(client.startRun).not.toHaveBeenCalled();
  });
  it("requires data-management permission before reading CMS context", async () => {
    const read = vi.spyOn(PageDraftUpdate.prototype, "readContext");
    const denied = {
      ...pageOptions,
      access: { canManageData: () => false },
    } as unknown as SanitizedRealizeAIPluginOptions;
    await expect(
      createChatMessage(pageReq, denied, 1, "2", "page", pageInput),
    ).rejects.toMatchObject({ status: 403 });
    expect(read).not.toHaveBeenCalled();
    expect(client.startRun).not.toHaveBeenCalled();
  });
  it("persists a context snapshot and relays only server-owned asset references", async () => {
    const result = await createChatMessage(req, options, 1, "2", "request", {
      content: "",
      attachmentIDs: ["7"],
      projectFiles: [{ path: "src/a.ts", sha256: "b".repeat(64) }],
      webSearch: true,
    });
    expect(
      ChatAttachmentRepository.prototype.requireOwned,
    ).toHaveBeenCalledWith("7", 1, true);
    expect(client.claimChatAsset).toHaveBeenCalledWith(
      { id: attachment.assetID, sha256: attachment.sha256 },
      "4",
    );
    expect(client.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "",
        webSearch: true,
        attachments: [{ id: attachment.assetID, sha256: attachment.sha256 }],
        projectFiles: [{ path: "src/a.ts", sha256: "b".repeat(64) }],
      }),
    );
    expect(AIRepository.prototype.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(result.message).toMatchObject({
      attachments: [
        { id: "7", url: "/api/realize-ai/chat/attachments/7/file" },
      ],
      projectFiles: [{ path: "src/a.ts" }],
      webSearch: true,
    });
  });
  it("replays the exact request and rejects a changed web flag under the same key", async () => {
    const input = { content: "hello", webSearch: false };
    await createChatMessage(req, options, 1, "2", "same", input);
    const saved = vi.mocked(AIRepository.prototype.createRun).mock.calls[0][0];
    vi.mocked(AIRepository.prototype.findRunByIdempotencyKey).mockResolvedValue(
      { ...run, requestHash: saved.requestHash },
    );
    client.startRun.mockClear();
    await expect(
      createChatMessage(req, options, 1, "2", "same", input),
    ).resolves.toMatchObject({ run: { id: "4" } });
    await expect(
      createChatMessage(req, options, 1, "2", "same", {
        ...input,
        webSearch: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(client.startRun).not.toHaveBeenCalled();
  });
  it("rejects foreign assets before creating a run", async () => {
    vi.mocked(
      ChatAttachmentRepository.prototype.requireOwned,
    ).mockRejectedValue(new Error("not owned"));
    await expect(
      createChatMessage(req, options, 2, "2", "foreign", {
        content: "hello",
        attachmentIDs: ["7"],
      }),
    ).rejects.toThrow("not owned");
    expect(AIRepository.prototype.createRun).not.toHaveBeenCalled();
    expect(client.startRun).not.toHaveBeenCalled();
  });
  it("rejects changed selected files before claiming assets or creating a run", async () => {
    client.resolveProjectFiles.mockRejectedValue(new Error("changed"));
    await expect(
      createChatMessage(req, options, 1, "2", "stale", {
        content: "hello",
        projectFiles: [{ path: "src/a.ts", sha256: "b".repeat(64) }],
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(AIRepository.prototype.createRun).not.toHaveBeenCalled();
    expect(client.claimChatAsset).not.toHaveBeenCalled();
  });
  it("never starts the model if a concurrent removal won the asset claim", async () => {
    client.claimChatAsset.mockRejectedValue(new Error("missing"));
    const result = await createChatMessage(req, options, 1, "2", "removed", {
      content: "hello",
      attachmentIDs: ["7"],
    });
    expect(result.run.status).toBe("failed");
    expect(client.startRun).not.toHaveBeenCalled();
    expect(ChatAttachmentRepository.prototype.link).not.toHaveBeenCalled();
  });
});

describe("immutable agent configuration for new chat runs", () => {
  const release = createAIConfigReleaseFixture(
    createAIConfigDraftFixture(AI_CONFIG_ARTIFACTS),
  );
  const selection = {
    releaseID: release.id,
    manifestHash: release.manifestHash,
    profileKey: "admin",
  };
  const activate = () => {
    vi.mocked(AIConfigRepository.prototype.getActivePointer).mockResolvedValue({
      id: 20,
      version: 1,
      releaseID: release.id,
      manifestHash: release.manifestHash,
      activatedAt: release.createdAt,
      activatedBy: 1,
    });
    vi.spyOn(AIConfigRepository.prototype, "requireRelease").mockResolvedValue({
      id: 10,
      releaseID: release.id,
      artifacts: release.artifacts,
      releasedAt: release.createdAt,
      createdBy: release.createdBy,
      manifestHash: release.manifestHash,
      schemaVersion: release.schemaVersion,
      sourceDraftID: release.sourceDraftID,
      sourceDraftRevision: release.sourceDraftRevision,
      version: release.version,
      systemMinimumRelease: release.systemCompatibility.minimumRelease,
      systemMaximumRelease: release.systemCompatibility.maximumRelease,
    });
  };
  it("pins compiled contents before runtime launch and exposes only a compact summary", async () => {
    activate();
    const result = await createChatMessage(req, options, 1, "2", "configured", {
      content: "Проверь каталог",
      agentConfiguration: selection,
    });
    const stored = vi.mocked(AIRepository.prototype.createRun).mock.calls[0]![0]
      .turnContext!;
    expect(stored.agentConfiguration?.compiled).toMatchObject({
      configReleaseID: release.id,
      configManifestHash: release.manifestHash,
      systemManifestHash: SYSTEM_AI_CONFIG_PROJECTION.manifestHash,
      profile: { key: "admin" },
    });
    expect(client.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConfiguration: stored.agentConfiguration,
      }),
    );
    expect(result.run.agentConfiguration).toMatchObject({
      releaseID: release.id,
      profileKey: "admin",
      pointerVersion: 1,
    });
    expect(result.run.agentConfiguration).not.toHaveProperty("compiled");
    expect(result.run.agentConfiguration).not.toHaveProperty(
      "selectedArtifacts",
    );
    expect(result.message).not.toHaveProperty("agentConfiguration");
  });
  it("replays the saved release after activation changed without resolving new policy", async () => {
    activate();
    const input = { content: "Проверь каталог", agentConfiguration: selection };
    await createChatMessage(req, options, 1, "2", "configured", input);
    const stored = vi.mocked(AIRepository.prototype.createRun).mock
      .calls[0]![0];
    vi.mocked(AIRepository.prototype.findRunByIdempotencyKey).mockResolvedValue(
      { ...run, ...stored },
    );
    vi.mocked(AIConfigRepository.prototype.getActivePointer).mockRejectedValue(
      new Error("new active version must not be read during replay"),
    );
    client.startRun.mockClear();
    const result = await createChatMessage(
      req,
      options,
      1,
      "2",
      "configured",
      input,
    );
    expect(result.run.agentConfiguration?.releaseID).toBe(release.id);
    expect(client.startRun).not.toHaveBeenCalled();
    await expect(
      createChatMessage(req, options, 1, "2", "configured", {
        ...input,
        agentConfiguration: { ...selection, profileKey: "other" },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it.each([
    undefined,
    { ...selection, manifestHash: "f".repeat(64) },
    { ...selection, releaseID: "old-release" },
  ])(
    "rejects an absent or stale selection before creating a run: %j",
    async (agentConfiguration) => {
      activate();
      await expect(
        createChatMessage(req, options, 1, "2", "configured", {
          content: "Проверь каталог",
          agentConfiguration,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(AIRepository.prototype.createRun).not.toHaveBeenCalled();
      expect(client.startRun).not.toHaveBeenCalled();
    },
  );
  it("pins distinct context hashes for model, policy and compiled configuration without resuming old tools", async () => {
    await createChatMessage(req, options, 1, "2", "legacy", {
      content: "Первый запрос",
    });
    const baseline = vi
      .mocked(AIRepository.prototype.createRun)
      .mock.calls.at(-1)![0].turnContext!.runtimeContextHash;
    await createChatMessage(req, options, 1, "2", "web", {
      content: "Другой запрос",
      webSearch: true,
    });
    expect(
      vi.mocked(AIRepository.prototype.createRun).mock.calls.at(-1)![0]
        .turnContext!.runtimeContextHash,
    ).not.toBe(baseline);
    await createChatMessage(
      req,
      { ...options, runtime: { ...options.runtime, model: "other-model" } },
      1,
      "2",
      "model",
      { content: "Другой запрос" },
    );
    expect(
      vi.mocked(AIRepository.prototype.createRun).mock.calls.at(-1)![0]
        .turnContext!.runtimeContextHash,
    ).not.toBe(baseline);
    activate();
    await createChatMessage(req, options, 1, "2", "configured", {
      content: "Первый запрос",
      agentConfiguration: selection,
    });
    expect(
      vi.mocked(AIRepository.prototype.createRun).mock.calls.at(-1)![0]
        .turnContext!.runtimeContextHash,
    ).not.toBe(baseline);
  });
  it("passes bounded prior messages as data only when a compatible thread is unavailable", async () => {
    vi.mocked(AIRepository.prototype.getLatestThreadID).mockResolvedValue(
      undefined,
    );
    vi.mocked(AIRepository.prototype.getConversationDetail).mockResolvedValue({
      conversation: { id: 2, status: "active" },
      runs: [],
      messages: [
        { id: 5, role: "user", content: "Ранее выбран товар" },
        { id: 6, role: "assistant", content: "Уточните категорию" },
      ],
    });
    await createChatMessage(req, options, 1, "2", "history", {
      content: "Категория А",
    });
    expect(client.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: JSON.stringify({
          messages: [
            { role: "user", content: "Ранее выбран товар" },
            { role: "assistant", content: "Уточните категорию" },
          ],
          truncated: false,
        }),
      }),
    );
  });
  it("starts a fresh thread with bounded prior data even when an older thread is compatible", async () => {
    activate();
    vi.mocked(AIRepository.prototype.getConversationDetail).mockResolvedValue({
      conversation: { id: 2, status: "active" },
      runs: [],
      messages: [
        { id: 5, role: "user", content: "Ранее выбран товар" },
        { id: 6, role: "assistant", content: "Уточните категорию" },
      ],
    });
    await createChatMessage(req, options, 1, "2", "compatible-thread", {
      content: "Категория А",
      agentConfiguration: selection,
    });
    const stored = vi.mocked(AIRepository.prototype.createRun).mock
      .calls[0]![0];
    expect(AIRepository.prototype.getLatestThreadID).not.toHaveBeenCalled();
    expect(stored.threadID).toBeUndefined();
    expect(stored.turnContext!.conversationHistory).toContain(
      "Ранее выбран товар",
    );
    const transport = client.startRun.mock.calls[0]![0];
    expect(transport.threadID).toBeUndefined();
    expect(transport.prompt).toBe("Категория А");
    expect(transport.agentConfiguration).toEqual(
      stored.turnContext!.agentConfiguration,
    );
    expect(transport.conversationHistory).toBe(
      stored.turnContext!.conversationHistory,
    );
    expect(transport.repositoryAccess).toEqual({
      developerInstructions: false,
    });
  });
});
