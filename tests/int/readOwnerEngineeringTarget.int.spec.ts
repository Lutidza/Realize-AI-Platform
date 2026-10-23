// @vitest-environment node
/**
 * @file tests/int/readOwnerEngineeringTarget.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Проверяет авторизацию и безопасную проекцию фактической машины инженерного runtime.
 */
import { realpath } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PayloadRequest } from "payload";
import { CODEX_CHAT_SETTINGS_DEFAULTS } from "@realize/ai-contracts";
import { readOwnerEngineeringTarget } from "../../packages/payload-ai-plugin/src/chat-context/readOwnerEngineeringTarget.service";
import * as chatSettings from "../../packages/payload-ai-plugin/src/integrations/codex/readCodexChatSettings.service";
import type { SanitizedRealizeAIPluginOptions } from "../../packages/payload-ai-plugin/src/types";

const client = vi.hoisted(() => ({ ownerEngineeringStatus: vi.fn() }));
vi.mock(
  "../../packages/payload-ai-plugin/src/runtime/getControlPlaneClient",
  () => ({ getControlPlaneClient: () => client }),
);
const req = { user: { id: 1 } } as PayloadRequest;
const options = (): SanitizedRealizeAIPluginOptions =>
  ({
    enabled: true,
    access: { canUseChat: () => true, canUseOwnerEngineering: () => true },
    runtime: {
      mode: "local-development",
      isolated: false,
      controlPlaneTokenEnv: "OWNER_TARGET_TEST_SECRET",
      ownerEngineering: {
        enabled: true,
        repositoryRoot: process.cwd(),
        osUser: "gio",
      },
    },
  }) as unknown as SanitizedRealizeAIPluginOptions;
let target: {
  enabled: true;
  mode: "owner-host";
  workspaceRoot: string;
  osUser: string;
  hostname: string;
};
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.stubEnv(
    "OWNER_TARGET_TEST_SECRET",
    "fixture-owner-target-secret-with-32-characters",
  );
  vi.spyOn(chatSettings, "readCodexChatSettings").mockResolvedValue({
    ...CODEX_CHAT_SETTINGS_DEFAULTS,
    tools: { codeChanges: true, dataOperations: true },
  });
  target = {
    enabled: true,
    mode: "owner-host",
    workspaceRoot: await realpath(process.cwd()),
    osUser: "gio",
    hostname: "workstation-1",
  };
  client.ownerEngineeringStatus
    .mockReset()
    .mockResolvedValue({ state: "ready", ownerEngineering: target });
});
afterEach(() => vi.unstubAllEnvs());

describe("owner engineering target projection", () => {
  it("returns only the target allowlist and strips private CP fields", async () => {
    client.ownerEngineeringStatus.mockResolvedValue({
      token: "synthetic-private-token",
      ownerEngineering: {
        ...target,
        stateRoot: "/private/state",
        ownerIDs: ["1"],
        credentialEnvelope: "synthetic-private-envelope",
        signature: "synthetic-private-signature",
      },
    });
    expect(await readOwnerEngineeringTarget(req, options())).toEqual(target);
  });
  it.each(["nonowner", "missing callback", "anonymous", "chat denied"])(
    "never contacts CP for %s",
    async (denied) => {
      const current = options();
      if (denied === "nonowner")
        current.access.canUseOwnerEngineering = () => false;
      if (denied === "missing callback")
        current.access.canUseOwnerEngineering = undefined;
      if (denied === "chat denied") current.access.canUseChat = () => false;
      expect(
        await readOwnerEngineeringTarget(
          denied === "anonymous" ? ({} as PayloadRequest) : req,
          current,
        ),
      ).toBeNull();
      expect(client.ownerEngineeringStatus).not.toHaveBeenCalled();
    },
  );
  it.each([
    { workspaceRoot: "/other-project" },
    { osUser: "other-user" },
    { mode: "analysis-readonly" },
    { enabled: false },
    { hostname: "https://host/private" },
  ])("fails closed on incompatible CP target %j", async (change) => {
    client.ownerEngineeringStatus.mockResolvedValue({
      ownerEngineering: { ...target, ...change },
    });
    expect(await readOwnerEngineeringTarget(req, options())).toBeNull();
  });
  it.each([
    null,
    undefined,
    {},
    [],
    { ownerEngineering: null },
    { ownerEngineering: [] },
  ])("returns null for unavailable or malformed status %j", async (status) => {
    client.ownerEngineeringStatus.mockResolvedValue(status);
    expect(await readOwnerEngineeringTarget(req, options())).toBeNull();
  });
  it("contains a CP outage and retains the normal catalog contract", async () => {
    client.ownerEngineeringStatus.mockRejectedValue(new Error("unavailable"));
    expect(await readOwnerEngineeringTarget(req, options())).toBeNull();
  });
  it("does not disclose the target when runtime was disabled in fresh request options", async () => {
    const current = options();
    current.enabled = false;
    expect(await readOwnerEngineeringTarget(req, current)).toBeNull();
    expect(client.ownerEngineeringStatus).not.toHaveBeenCalled();
  });
});
