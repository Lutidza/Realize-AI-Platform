// @vitest-environment node
/**
 * @file tests/int/ownerEngineeringRuntime.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Проверяет подпись owner-допуска, logical replay и приватный durable-журнал без запуска модели.
 */
import { createHmac } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  encodeOwnerEngineeringGrant,
  OWNER_ENGINEERING_GRANT_DOMAIN,
  OWNER_ENGINEERING_GRANT_TTL_MS,
  OWNER_ENGINEERING_PROFILE_KEY,
  type AIChatConfigurationSnapshot,
  type OwnerEngineeringGrant,
} from "@realize/ai-contracts";
import {
  compileAgentConfiguration,
  SYSTEM_AI_CONFIG_PROJECTION,
  SYSTEM_AI_RELEASE_REFERENCE,
} from "@realize/change-engine";
import { parseChatRun } from "../../services/ai-control-plane/src/parseChatRun.validator";
import { RunStore } from "../../services/ai-control-plane/src/runStore";
import { OwnerEngineeringRunRepository } from "../../services/ai-control-plane/src/owner-engineering/OwnerEngineeringRun.repository";
import { parseOwnerEngineeringGrant } from "../../services/ai-control-plane/src/owner-engineering/parseOwnerEngineeringGrant.validator";
import { readOwnerEngineeringConfiguration } from "../../services/ai-control-plane/src/owner-engineering/readOwnerEngineeringConfiguration.config";
import { verifyOwnerEngineeringGrant } from "../../services/ai-control-plane/src/owner-engineering/verifyOwnerEngineeringGrant.validator";
import type {
  OwnerEngineeringConfiguration,
  OwnerEngineeringRunReceipt,
} from "../../services/ai-control-plane/src/owner-engineering/OwnerEngineeringRuntime.types";
import {
  AI_CONFIG_ARTIFACTS,
  createAIConfigDraftFixture,
  createAIConfigReleaseFixture,
} from "./fixtures/aiConfiguration";

const token = "owner-runtime-test-token".repeat(3);
const now = Date.parse("2026-10-23T12:00:00.000Z");
const release = createAIConfigReleaseFixture(
  createAIConfigDraftFixture(
    AI_CONFIG_ARTIFACTS.map((artifact) =>
      artifact.kind === "agent_profile"
        ? { ...artifact, key: OWNER_ENGINEERING_PROFILE_KEY }
        : artifact,
    ),
  ),
);
const agentConfiguration: AIChatConfigurationSnapshot = {
  schemaVersion: "1.0",
  pointerVersion: 1,
  releaseVersion: release.version,
  compiled: compileAgentConfiguration({
    release,
    system: SYSTEM_AI_CONFIG_PROJECTION,
    profileKey: OWNER_ENGINEERING_PROFILE_KEY,
  }),
};
const configuration: OwnerEngineeringConfiguration = {
  enabled: true,
  mode: "owner-host",
  hostname: "test-host",
  osUser: "gio",
  workspaceRoot: process.cwd(),
  stateRoot: "/private/test-owner-state",
  ownerIDs: ["1", "2"],
};

const sign = (
  changes: Partial<Omit<OwnerEngineeringGrant, "signature">> = {},
): OwnerEngineeringGrant => {
  const claims: Omit<OwnerEngineeringGrant, "signature"> = {
    schemaVersion: "1.0",
    runID: "owner-run-1",
    actorID: "1",
    profileKey: OWNER_ENGINEERING_PROFILE_KEY,
    configurationHash: agentConfiguration.compiled.compiledContextHash,
    workspaceRoot: configuration.workspaceRoot,
    issuedAt: now - 1_000,
    expiresAt: now - 1_000 + OWNER_ENGINEERING_GRANT_TTL_MS,
    ...changes,
  };
  return {
    ...claims,
    signature: createHmac("sha256", token)
      .update(OWNER_ENGINEERING_GRANT_DOMAIN)
      .update(encodeOwnerEngineeringGrant(claims))
      .digest("base64url"),
  };
};
const request = (ownerEngineering = sign()) => ({
  runID: "owner-run-1",
  prompt: "Проверь локальный проект",
  agentConfiguration,
  systemRelease: SYSTEM_AI_RELEASE_REFERENCE,
  ownerEngineering,
});
const verify = (grant = sign()) =>
  verifyOwnerEngineeringGrant(
    { id: "owner-run-1", agentConfiguration, ownerEngineering: grant },
    configuration,
    token,
    now,
  );

describe("owner engineering CP admission", () => {
  it("accepts only the valid exact run admission", () => {
    expect(verify()).toEqual(sign());
    expect(parseChatRun(request())).toMatchObject({
      id: "owner-run-1",
      ownerEngineering: sign(),
    });
  });
  it.each([
    ["signature", { signature: "a".repeat(43) }],
    ["actor", { actorID: "2" }],
    [
      "issuedAt",
      { issuedAt: now, expiresAt: now + OWNER_ENGINEERING_GRANT_TTL_MS },
    ],
  ])("rejects unsigned tampering of %s", (_name, fields) => {
    expect(() => verify({ ...sign(), ...fields })).toThrow(
      "owner_engineering_admission_denied",
    );
  });
  it.each([
    ["run", { runID: "other-run" }],
    ["root", { workspaceRoot: "/different-project" }],
    ["owner", { actorID: "3" }],
    ["compiled hash", { configurationHash: "f".repeat(64) }],
    [
      "expired",
      { issuedAt: now - OWNER_ENGINEERING_GRANT_TTL_MS, expiresAt: now },
    ],
    [
      "future",
      {
        issuedAt: now + 30_001,
        expiresAt: now + 30_001 + OWNER_ENGINEERING_GRANT_TTL_MS,
      },
    ],
  ])("rejects a correctly signed grant with mismatched %s", (_name, fields) => {
    expect(() => verify(sign(fields))).toThrow(
      "owner_engineering_admission_denied",
    );
  });
  it("rejects changed compiled profile and disabled deployment", () => {
    const changed = structuredClone(agentConfiguration);
    changed.compiled.profile.key = "admin";
    expect(() =>
      verifyOwnerEngineeringGrant(
        {
          id: "owner-run-1",
          agentConfiguration: changed,
          ownerEngineering: sign(),
        },
        configuration,
        token,
        now,
      ),
    ).toThrow("owner_engineering_admission_denied");
    expect(() =>
      verifyOwnerEngineeringGrant(
        { id: "owner-run-1", agentConfiguration, ownerEngineering: sign() },
        null,
        token,
        now,
      ),
    ).toThrow("owner_engineering_admission_denied");
    expect(() =>
      verifyOwnerEngineeringGrant(
        { id: "owner-run-1", agentConfiguration, ownerEngineering: sign() },
        configuration,
        "wrong-secret".repeat(4),
        now,
      ),
    ).toThrow("owner_engineering_admission_denied");
  });
  it.each([
    { extra: true },
    { actorID: "../owner" },
    { workspaceRoot: "relative" },
    { issuedAt: 1.5 },
    { expiresAt: now + 1 },
    { schemaVersion: "2.0" },
    { signature: "short" },
  ])("rejects malformed or expanded grant %j", (fields) => {
    expect(() => parseOwnerEngineeringGrant({ ...sign(), ...fields })).toThrow(
      "owner_engineering_grant_invalid",
    );
  });
  it.each(["repositoryAccess", "pageDiscovery", "pageDraftContext"])(
    "rejects mixed authority: %s",
    (field) => {
      expect(() => parseChatRun({ ...request(), [field]: {} })).toThrow(
        "owner_engineering_product_tools_forbidden",
      );
    },
  );
  it("rejects browser execution overrides and an owner profile without grant", () => {
    for (const field of ["cwd", "sandboxProfile", "ownerHost"])
      expect(() => parseChatRun({ ...request(), [field]: "/" })).toThrow(
        "Unknown run option",
      );
    const { ownerEngineering: _grant, ...withoutGrant } = request();
    expect(() => parseChatRun(withoutGrant)).toThrow(
      "owner_engineering_profile_grant_mismatch",
    );
  });
});

describe("owner engineering logical run replay", () => {
  it("accepts a renewed signature without changing the existing execution or events", () => {
    const store = new RunStore();
    const first = store.create(parseChatRun(request()));
    first.status = "running";
    store.append(first.id, "run.started", { threadID: "thread-1" });
    const renewed = sign({
      issuedAt: now,
      expiresAt: now + OWNER_ENGINEERING_GRANT_TTL_MS,
    });
    const replay = store.create(parseChatRun(request(renewed)));
    expect(replay).toBe(first);
    expect(replay.status).toBe("running");
    expect(replay.events).toHaveLength(1);
    expect(replay.ownerEngineering!.signature).toBe(sign().signature);
  });
  it("rejects changed prompt and actor even for a fresh signed grant", () => {
    const store = new RunStore();
    store.create(parseChatRun(request()));
    expect(() =>
      store.create(parseChatRun({ ...request(), prompt: "Другое задание" })),
    ).toThrow("different request");
    expect(() =>
      store.create(parseChatRun(request(sign({ actorID: "2" })))),
    ).toThrow("different request");
  });
});

describe("owner engineering durable journal", () => {
  let stateRoot: string;
  const receipt = (runID = "owner-run-1"): OwnerEngineeringRunReceipt => ({
    schemaVersion: "1.0",
    runID,
    actorID: "1",
    fingerprint: "b".repeat(64),
    workspaceRoot: configuration.workspaceRoot,
    osUser: userInfo().username,
    startedAt: new Date(now).toISOString(),
    outcome: "started",
  });
  beforeEach(async () => {
    stateRoot = await mkdtemp(join(tmpdir(), "realize-owner-runtime-"));
  });
  afterEach(async () => {
    await rm(stateRoot, { recursive: true, force: true });
  });

  it("records admission before effects, persists terminal outcome and never replays the same run", async () => {
    const repository = new OwnerEngineeringRunRepository(stateRoot);
    const lease = await repository.acquire(receipt());
    const path = join(stateRoot, "runs", "owner-run-1.json");
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      outcome: "started",
    });
    expect((await lstat(path)).mode & 0o077).toBe(0);
    await lease.finish("completed");
    await lease.finish("completed");
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      outcome: "completed",
      finishedAt: expect.any(String),
    });
    await expect(lstat(join(stateRoot, "active.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      new OwnerEngineeringRunRepository(stateRoot).acquire(receipt()),
    ).rejects.toThrow("owner_engineering_run_already_started");
  });
  it("blocks unknown outcome after process restart and retains its receipt", async () => {
    const lease = await new OwnerEngineeringRunRepository(stateRoot).acquire(
      receipt(),
    );
    const restarted = new OwnerEngineeringRunRepository(stateRoot);
    await expect(restarted.acquire(receipt())).rejects.toThrow(
      "owner_engineering_run_already_started",
    );
    await expect(restarted.acquire(receipt("another-run"))).rejects.toThrow(
      "owner_engineering_busy_or_recovery_required",
    );
    expect(
      JSON.parse(
        await readFile(join(stateRoot, "runs", "owner-run-1.json"), "utf8"),
      ),
    ).toMatchObject({ outcome: "started" });
    await lease.finish("cancelled");
  });
  it("admits at most one concurrent run and permits a new run after settlement", async () => {
    const repository = new OwnerEngineeringRunRepository(stateRoot);
    const results = await Promise.allSettled([
      repository.acquire(receipt("run-a")),
      repository.acquire(receipt("run-b")),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    for (const result of results)
      if (result.status === "fulfilled") await result.value.finish("failed");
    const next = await repository.acquire(receipt("run-c"));
    await next.finish("completed");
  });
  it("fails closed for an existing partial receipt without an active lock", async () => {
    await mkdir(join(stateRoot, "runs"), { mode: 0o700 });
    await writeFile(join(stateRoot, "runs", "owner-run-1.json"), "{", {
      mode: 0o600,
    });
    await expect(
      new OwnerEngineeringRunRepository(stateRoot).acquire(receipt()),
    ).rejects.toThrow("owner_engineering_run_already_started");
  });
  it.each(["root", "runs"])(
    "rejects a publicly accessible %s directory",
    async (target) => {
      const directory = target === "root" ? stateRoot : join(stateRoot, "runs");
      if (target === "runs") await mkdir(directory, { mode: 0o700 });
      await chmod(directory, 0o755);
      await expect(
        new OwnerEngineeringRunRepository(stateRoot).acquire(receipt()),
      ).rejects.toThrow("owner_engineering_state_invalid");
    },
  );
  it("rejects a symlink in the durable receipt directory", async () => {
    const target = join(stateRoot, "target");
    await mkdir(target, { mode: 0o700 });
    await symlink(target, join(stateRoot, "runs"));
    await expect(
      new OwnerEngineeringRunRepository(stateRoot).acquire(receipt()),
    ).rejects.toThrow("owner_engineering_state_invalid");
  });
  it("rejects changed lease ownership without deleting the replacement lock", async () => {
    const lease = await new OwnerEngineeringRunRepository(stateRoot).acquire(
      receipt(),
    );
    await writeFile(join(stateRoot, "active.json"), "replacement");
    await expect(lease.finish("completed")).rejects.toThrow(
      "owner_engineering_lease_changed",
    );
    expect(await readFile(join(stateRoot, "active.json"), "utf8")).toBe(
      "replacement",
    );
  });
  it("checks deployment user and state permissions before enabling host execution", async () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      REALIZE_AI_OWNER_ENGINEERING_ENABLED: "true",
      REALIZE_AI_OWNER_ENGINEERING_OS_USER: userInfo().username,
      REALIZE_AI_OWNER_ENGINEERING_STATE_ROOT: stateRoot,
      REALIZE_AI_RUNTIME_MODE: "local-development",
      REALIZE_PLATFORM_OWNER_USER_IDS: "1,2",
    };
    expect(
      await readOwnerEngineeringConfiguration(process.cwd(), environment),
    ).toMatchObject({ mode: "owner-host", stateRoot, ownerIDs: ["1", "2"] });
    await expect(
      readOwnerEngineeringConfiguration(process.cwd(), {
        ...environment,
        REALIZE_AI_OWNER_ENGINEERING_OS_USER: "wrong-user",
      }),
    ).rejects.toThrow("owner_engineering_configuration_invalid");
    await chmod(stateRoot, 0o755);
    await expect(
      readOwnerEngineeringConfiguration(process.cwd(), environment),
    ).rejects.toThrow("owner_engineering_state_invalid");
  });
});
