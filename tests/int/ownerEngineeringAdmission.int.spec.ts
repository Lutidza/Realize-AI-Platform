// @vitest-environment node
/**
 * @file tests/int/ownerEngineeringAdmission.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Проверяет owner-допуск, deployment gates, границы выбора и подпись одного запуска.
 */
import { createHmac } from "node:crypto";
import { realpath } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PayloadRequest } from "payload";
import {
  CODEX_CHAT_SETTINGS_DEFAULTS,
  OWNER_ENGINEERING_PROFILE_KEY,
  OWNER_ENGINEERING_GRANT_DOMAIN,
  encodeOwnerEngineeringGrant,
  parseCreateMessageInput,
} from "@realize/ai-contracts";
import {
  compileAgentConfiguration,
  SYSTEM_AI_CONFIG_PROJECTION,
} from "@realize/change-engine";
import {
  createOwnerEngineeringGrant,
  requireOwnerEngineeringAccess,
  requireOwnerEngineeringWorkflowProfile,
} from "../../packages/payload-ai-plugin/src/chat-context/ownerEngineeringAdmission.service";
import {
  readAIChatConfigurationCatalog,
  resolveAIChatConfiguration,
} from "../../packages/payload-ai-plugin/src/chat-context/resolveAIChatConfiguration.service";
import { AIConfigRepository } from "../../packages/payload-ai-plugin/src/endpoints/aiConfigRepository";
import * as settings from "../../packages/payload-ai-plugin/src/integrations/codex/readCodexChatSettings.service";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";
import { createChatMessage } from "../../packages/payload-ai-plugin/src/chat-context/createChatMessage.service";
import { AIRepository } from "../../packages/payload-ai-plugin/src/endpoints/repository";
import {
  AI_CONFIG_ARTIFACTS,
  createAIConfigDraftFixture,
  createAIConfigReleaseFixture,
} from "./fixtures/aiConfiguration";

const client = vi.hoisted(() => ({ startRun: vi.fn() }));
vi.mock(
  "../../packages/payload-ai-plugin/src/runtime/getControlPlaneClient",
  () => ({ getControlPlaneClient: () => client }),
);

const ownerProfile = AI_CONFIG_ARTIFACTS.find(
  (artifact) => artifact.kind === "agent_profile",
)!;
const release = createAIConfigReleaseFixture(
  createAIConfigDraftFixture([
    ...AI_CONFIG_ARTIFACTS,
    { ...ownerProfile, key: OWNER_ENGINEERING_PROFILE_KEY },
  ]),
);
const snapshot = {
  schemaVersion: "1.0" as const,
  pointerVersion: 1,
  releaseVersion: 1,
  compiled: compileAgentConfiguration({
    release,
    system: SYSTEM_AI_CONFIG_PROJECTION,
    profileKey: OWNER_ENGINEERING_PROFILE_KEY,
  }),
};
const req = {
  user: { id: 1 },
  payload: { db: { defaultIDType: "number" } },
} as PayloadRequest;
const makeOptions = (): SanitizedRealizeAIPluginOptions =>
  ({
    enabled: true,
    access: { canUseChat: () => true, canUseOwnerEngineering: () => true },
    runtime: {
      mode: "local-development",
      isolated: false,
      controlPlaneTokenEnv: "OWNER_ENGINEERING_TEST_SECRET",
      ownerEngineering: {
        enabled: true,
        repositoryRoot: process.cwd(),
        osUser: "gio",
      },
    },
  }) as unknown as SanitizedRealizeAIPluginOptions;

beforeEach(() => {
  vi.restoreAllMocks();
  client.startRun.mockReset().mockResolvedValue(undefined);
  vi.stubEnv(
    "OWNER_ENGINEERING_TEST_SECRET",
    "test-secret-never-a-production-credential",
  );
  vi.spyOn(settings, "readCodexChatSettings").mockResolvedValue({
    ...CODEX_CHAT_SETTINGS_DEFAULTS,
    tools: { codeChanges: true, dataOperations: true },
  });
  vi.spyOn(AIConfigRepository.prototype, "getActivePointer").mockResolvedValue({
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
});
afterEach(() => vi.unstubAllEnvs());

describe("owner engineering admission", () => {
  it("sends a server grant once and replays the stored chat run without renewing host authority", async () => {
    const options = makeOptions();
    options.access.canManageAIConfiguration = () => false;
    vi.spyOn(AIRepository.prototype, "getConversationDetail").mockResolvedValue(
      { conversation: { id: 2, status: "active" }, messages: [], runs: [] },
    );
    const find = vi
      .spyOn(AIRepository.prototype, "findRunByIdempotencyKey")
      .mockResolvedValue(undefined);
    const create = vi
      .spyOn(AIRepository.prototype, "createRun")
      .mockImplementation(async (input) => ({
        id: 4,
        conversation: 2,
        status: "queued",
        ...input,
      }));
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
    const input = {
      content: "Локальная задача",
      agentConfiguration: {
        releaseID: release.id,
        manifestHash: release.manifestHash,
        profileKey: OWNER_ENGINEERING_PROFILE_KEY,
      },
    };
    await createChatMessage(req, options, 1, "2", "owner-message", input);
    expect(client.startRun.mock.calls[0][0].ownerEngineering).toMatchObject({
      runID: "4",
      actorID: "1",
    });
    expect(client.startRun.mock.calls[0][0]).not.toHaveProperty(
      "repositoryAccess",
    );
    expect(client.startRun.mock.calls[0][0]).not.toHaveProperty(
      "pageDiscovery",
    );
    const stored = create.mock.calls[0][0];
    expect(stored.turnContext!.ownerEngineering).toMatchObject({
      mode: "owner-host",
      profileKey: OWNER_ENGINEERING_PROFILE_KEY,
    });
    expect(JSON.stringify(stored)).not.toContain("signature");
    find.mockResolvedValue({
      id: 4,
      conversation: 2,
      status: "completed",
      ...stored,
    });
    client.startRun.mockClear();
    options.access.canUseOwnerEngineering = () => false;
    await expect(
      createChatMessage(req, options, 1, "2", "owner-message", input),
    ).resolves.toMatchObject({ run: { id: "4", status: "completed" } });
    expect(client.startRun).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("rejects a CMS page selection before creating an owner run", async () => {
    vi.spyOn(AIRepository.prototype, "getConversationDetail").mockResolvedValue(
      { conversation: { id: 2, status: "active" }, messages: [], runs: [] },
    );
    vi.spyOn(
      AIRepository.prototype,
      "findRunByIdempotencyKey",
    ).mockResolvedValue(undefined);
    const create = vi.spyOn(AIRepository.prototype, "createRun");
    await expect(
      createChatMessage(req, makeOptions(), 1, "2", "owner-page", {
        content: "change",
        agentConfiguration: {
          releaseID: release.id,
          manifestHash: release.manifestHash,
          profileKey: OWNER_ENGINEERING_PROFILE_KEY,
        },
        pageDraft: { id: "1", fingerprint: "a".repeat(64) },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(create).not.toHaveBeenCalled();
    expect(client.startRun).not.toHaveBeenCalled();
  });
  it("binds a signed one-hour grant to the exact server run, actor, configuration and canonical root", async () => {
    const grant = await createOwnerEngineeringGrant(
      req,
      makeOptions(),
      snapshot,
      "run-owner-1",
      1,
    );
    expect(grant).toMatchObject({
      schemaVersion: "1.0",
      runID: "run-owner-1",
      actorID: "1",
      profileKey: OWNER_ENGINEERING_PROFILE_KEY,
      configurationHash: snapshot.compiled.compiledContextHash,
      workspaceRoot: await realpath(process.cwd()),
    });
    expect(grant!.expiresAt - grant!.issuedAt).toBe(3_600_000);
    expect(grant!.signature).toBe(
      createHmac("sha256", process.env.OWNER_ENGINEERING_TEST_SECRET!)
        .update(OWNER_ENGINEERING_GRANT_DOMAIN)
        .update(encodeOwnerEngineeringGrant(grant!))
        .digest("base64url"),
    );
    await expect(
      createOwnerEngineeringGrant(
        req,
        makeOptions(),
        snapshot,
        "run-owner-1",
        2,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("does not grant ordinary profiles even for the owner", async () => {
    const configuration = {
      ...snapshot,
      compiled: compileAgentConfiguration({
        release,
        system: SYSTEM_AI_CONFIG_PROJECTION,
        profileKey: "admin",
      }),
    };
    expect(
      await createOwnerEngineeringGrant(
        req,
        makeOptions(),
        configuration,
        "run-normal",
        1,
      ),
    ).toBeUndefined();
  });
  it("rejects missing and revoked owner permission even when general chat access exists", async () => {
    const options = makeOptions();
    options.access.canUseOwnerEngineering = undefined;
    await expect(
      requireOwnerEngineeringAccess(req, options),
    ).rejects.toMatchObject({ status: 403 });
    options.access.canUseOwnerEngineering = () => false;
    await expect(
      requireOwnerEngineeringAccess(req, options),
    ).rejects.toMatchObject({ status: 403 });
  });
  it.each(["disabled", "isolated", "central", "deployment", "osUser"])(
    "fails closed for %s runtime",
    async (gate) => {
      const options = makeOptions();
      if (gate === "disabled") options.enabled = false;
      if (gate === "isolated") options.runtime.isolated = true;
      if (gate === "central") options.runtime.mode = "central-control-plane";
      if (gate === "deployment")
        options.runtime.ownerEngineering!.enabled = false;
      if (gate === "osUser") options.runtime.ownerEngineering!.osUser = "";
      await expect(
        requireOwnerEngineeringAccess(req, options),
      ).rejects.toMatchObject({ status: 409 });
    },
  );
  it.each(["codeChanges", "dataOperations"] as const)(
    "honors disabled %s for unrestricted host execution",
    async (tool) => {
      vi.mocked(settings.readCodexChatSettings).mockResolvedValue({
        ...CODEX_CHAT_SETTINGS_DEFAULTS,
        tools: { codeChanges: true, dataOperations: true, [tool]: false },
      });
      await expect(
        requireOwnerEngineeringAccess(req, makeOptions()),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
  it("hides owner profiles from nonowners and independently rejects forged selectors", async () => {
    const options = makeOptions();
    options.access.canUseOwnerEngineering = () => false;
    const catalog = await readAIChatConfigurationCatalog(req, options);
    expect(catalog.profiles.map((profile) => profile.key)).toEqual(["admin"]);
    await expect(
      resolveAIChatConfiguration(
        req,
        {
          releaseID: release.id,
          manifestHash: release.manifestHash,
          profileKey: OWNER_ENGINEERING_PROFILE_KEY,
        },
        "run",
        options,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await readAIChatConfigurationCatalog(req, makeOptions())).profiles.map(
        (profile) => profile.key,
      ),
    ).toContain(OWNER_ENGINEERING_PROFILE_KEY);
  });
  it("does not accept host authority through browser message fields", () => {
    expect(() =>
      parseCreateMessageInput({
        content: "hello",
        ownerEngineering: { signature: "forged" },
        sandboxProfile: "owner-host",
        cwd: "/",
        workspaceRoot: "/",
      }),
    ).toThrow("Неизвестный параметр сообщения");
    expect(() =>
      requireOwnerEngineeringWorkflowProfile(
        "admin",
        "platform.owner-engineering-workflow",
      ),
    ).toThrow();
  });
});
