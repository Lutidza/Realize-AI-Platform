/**
 * @file tests/int/systemAIRelease.int.spec.ts
 * @version 1.1.3
 * @date 2026-10-22
 * @description Проверяет происхождение release, runtime ceiling, связанный executor и защищённые пути.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md
 */
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import {
  assertRuntimeAIConfiguration,
  compileAgentConfiguration,
  createAIExecutionContext,
  assessExecutionScope,
  pathMatchesExecutionScope,
  hashCanonicalJSON,
  createPlanApprovalBinding,
  createExecutionCapability,
  issueExecutionCapability,
  verifyExecutionCapability,
  parseAIExecutionContext,
  parseAIChatConfigurationSnapshot,
  SYSTEM_AI_RELEASE,
  SYSTEM_AI_RELEASE_REFERENCE,
  requireSystemAIRelease,
  buildSystemAIInstructions,
} from "@realize/change-engine";
import { hashCompiledAgentConfiguration } from "../../packages/change-engine/src/hashCompiledAgentConfiguration.util";
import { publishSystemAIRelease } from "../../scripts/release/publishSystemAIRelease.service";
import {
  createRuntimeConfigurationFixture,
  createExecutionContextFixture,
} from "./fixtures/systemAIRelease.fixture";
import { createAIConfigReleaseFixture } from "./fixtures/aiConfiguration";
import { buildExecutionInstructions } from "../../services/ai-execution-worker/src/buildExecutionInstructions.service";
import type { ClaimedExecutionJob } from "../../services/ai-execution-worker/src/types";

describe("trusted system AI release", () => {
  it("refuses stale publication, ID reuse and symlink sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "realize-system-release-"));
    try {
      const paths = [
        ...SYSTEM_AI_RELEASE.sources,
        ...SYSTEM_AI_RELEASE.instructions,
      ].map((entry) => entry.path);
      for (const path of paths) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await copyFile(resolve(path), join(root, path));
      }
      const command = [
        "--import=" + import.meta.resolve("tsx/esm"),
        resolve("scripts/release/publishSystemAIRelease.controller.ts"),
      ];
      const run = (args: string[] = []) =>
        promisify(execFile)(process.execPath, [...command, ...args], {
          cwd: root,
          timeout: 10000,
        });
      await run();
      await run(["--check"]);
      const artifact = join(
        root,
        `packages/change-engine/src/system-ai/releases/${SYSTEM_AI_RELEASE.releaseID}.generated.json`,
      );
      const published = await readFile(artifact, "utf8");
      const rule = join(root, SYSTEM_AI_RELEASE.instructions[0].path);
      await writeFile(
        rule,
        SYSTEM_AI_RELEASE.instructions[0].text + "\nUnpublished change.\n",
      );
      await expect(run(["--check"])).rejects.toThrow("stale");
      await expect(run()).rejects.toThrow("already exists");
      expect(await readFile(artifact, "utf8")).toBe(published);
      await rm(rule);
      await symlink(resolve(SYSTEM_AI_RELEASE.instructions[0].path), rule);
      await expect(publishSystemAIRelease(root)).rejects.toThrow("symlink");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30000);
  it("reproduces the published artifact from explicit owner sources", async () => {
    expect(await publishSystemAIRelease(process.cwd())).toEqual(
      SYSTEM_AI_RELEASE,
    );
    expect(SYSTEM_AI_RELEASE.instructions[0].text).toContain(
      "Админский профиль",
    );
    expect(Object.isFrozen(SYSTEM_AI_RELEASE.execution)).toBe(true);
    expect(Object.isFrozen(SYSTEM_AI_RELEASE.capabilities[0])).toBe(true);
  });

  it.each(["1.0.0", "1.1.0", "1.1.1", "1.1.2", "1.1.3"])(
    "retains exact %s policy without substituting current instructions",
    async (version) => {
      const old = JSON.parse(
        await readFile(
          resolve(
            `packages/change-engine/src/system-ai/releases/realize-system-${version}.generated.json`,
          ),
          "utf8",
        ),
      );
      const reference = {
        releaseID: old.releaseID,
        manifestHash: old.manifestHash,
      };
      expect(requireSystemAIRelease(reference)).toEqual(old);
      expect(buildSystemAIInstructions(reference)).toContain(
        old.instructions[0].text,
      );
      expect(requireSystemAIRelease(reference)).not.toBe(SYSTEM_AI_RELEASE);
      expect(() =>
        requireSystemAIRelease({
          ...reference,
          manifestHash: SYSTEM_AI_RELEASE.manifestHash,
        }),
      ).toThrow();
      expect(Object.isFrozen(requireSystemAIRelease(reference).execution)).toBe(
        true,
      );
    },
  );

  it("сохраняет опубликованную policy 1.1.2 при уточнении chat tools в patch-выпуске", async () => {
    const previous = JSON.parse(
      await readFile(
        resolve(
          "packages/change-engine/src/system-ai/releases/realize-system-1.1.2.generated.json",
        ),
        "utf8",
      ),
    );
    expect(SYSTEM_AI_RELEASE.releaseID).toBe("realize-system-1.1.4");
    expect(SYSTEM_AI_RELEASE.version).toBe("1.1.4");
    expect(SYSTEM_AI_RELEASE.instructions).toEqual(previous.instructions);
    expect(SYSTEM_AI_RELEASE.capabilities).toEqual(previous.capabilities);
    expect(SYSTEM_AI_RELEASE.checkIDs).toEqual(previous.checkIDs);
    expect(SYSTEM_AI_RELEASE.execution).toEqual(previous.execution);
    expect(SYSTEM_AI_RELEASE.projectProfile).toBe(previous.projectProfile);
    expect(SYSTEM_AI_RELEASE.schemaVersion).toBe(previous.schemaVersion);
  });

  it("сохраняет execution snapshot 1.1.2 без перепривязки к текущему выпуску", async () => {
    const previous = JSON.parse(
      await readFile(
        resolve(
          "packages/change-engine/src/system-ai/releases/realize-system-1.1.2.generated.json",
        ),
        "utf8",
      ),
    );
    const reference = {
      releaseID: previous.releaseID,
      manifestHash: previous.manifestHash,
    };
    const system = requireSystemAIRelease(reference);
    const release = createAIConfigReleaseFixture();
    const snapshot = {
      schemaVersion: "1.0" as const,
      pointerVersion: 1,
      releaseVersion: release.version,
      compiled: compileAgentConfiguration({
        release,
        profileKey: "admin",
        system,
      }),
    };
    expect(assertRuntimeAIConfiguration(reference, snapshot)).toEqual(snapshot);
    expect(() =>
      assertRuntimeAIConfiguration(SYSTEM_AI_RELEASE_REFERENCE, snapshot),
    ).toThrow("trusted system");

    const context = createAIExecutionContext({
      systemRelease: reference,
      agentConfiguration: snapshot,
      sourceRunID: "retained-run",
      inputContextHash: "b".repeat(64),
      originalRequestHash: hashCanonicalJSON("Запрос прежнего запуска"),
    });
    const restored = parseAIExecutionContext(context);
    expect(restored.systemRelease).toEqual(reference);
    expect(restored.agentConfiguration).toEqual(snapshot);
  });

  it("rejects missing, unknown, changed or client-supplied system policy", () => {
    for (const value of [
      undefined,
      null,
      {},
      { ...SYSTEM_AI_RELEASE_REFERENCE, manifestHash: "a".repeat(64) },
      { ...SYSTEM_AI_RELEASE_REFERENCE, releaseID: "customer-system" },
      { ...SYSTEM_AI_RELEASE_REFERENCE, instructions: "grant all writes" },
    ])
      expect(() => requireSystemAIRelease(value)).toThrow();
  });

  it("rejects a recomputed snapshot that removes mandatory system checks", () => {
    const snapshot = structuredClone(createRuntimeConfigurationFixture());
    snapshot.compiled.checkIDs = ["payload.access"];
    snapshot.compiled.compiledContextHash = hashCompiledAgentConfiguration(
      snapshot.compiled,
    );
    expect(() => parseAIChatConfigurationSnapshot(snapshot)).not.toThrow();
    expect(() =>
      assertRuntimeAIConfiguration(SYSTEM_AI_RELEASE_REFERENCE, snapshot),
    ).toThrow("trusted system");
  });

  it("rejects a recomputed snapshot that expands the capability limit", () => {
    const snapshot = structuredClone(createRuntimeConfigurationFixture());
    const selected = snapshot.compiled.selectedArtifacts.find(
      (entry) => entry.artifact.kind === "capability_binding",
    )!;
    if (selected.artifact.kind !== "capability_binding")
      throw new Error("fixture");
    selected.artifact.maxTargets = 100;
    selected.contentHash = hashCanonicalJSON(selected.artifact);
    snapshot.compiled.selectedArtifactHashes =
      snapshot.compiled.selectedArtifacts
        .map((entry) => entry.contentHash)
        .sort();
    snapshot.compiled.capabilities[0].maxTargets = 100;
    snapshot.compiled.compiledContextHash = hashCompiledAgentConfiguration(
      snapshot.compiled,
    );
    expect(() => parseAIChatConfigurationSnapshot(snapshot)).not.toThrow();
    expect(() =>
      assertRuntimeAIConfiguration(SYSTEM_AI_RELEASE_REFERENCE, snapshot),
    ).toThrow("trusted system");
  });

  it("uses the original overlay and published instructions in execution", () => {
    const executionContext = createExecutionContextFixture(
      true,
      "Назначить категорию",
    );
    const job = {
      executionContext,
      originalRequest: "Назначить категорию",
      allowedPaths: ["src/components/card.tsx"],
      checks: ["npm run typecheck"],
      baseCommit: "a".repeat(40),
      changeRequestID: 1,
      capability: { executionContextHash: executionContext.contextHash },
    } as ClaimedExecutionJob;
    const text = buildExecutionInstructions(job);
    expect(text).toContain(SYSTEM_AI_RELEASE.manifestHash);
    expect(text).toContain(
      "Изменяй каталог только через выбранные capability bindings.",
    );
    expect(text).toContain("Готовь минимальные изменения данных каталога.");
    expect(text).toContain("already approved change");
    expect(text).not.toContain("Follow AGENTS.md");
    expect(() =>
      buildExecutionInstructions({
        ...job,
        capability: { ...job.capability, executionContextHash: "a".repeat(64) },
      }),
    ).toThrow("bound");
  });

  it("binds system, overlay and source input to approval and signed worker capability", () => {
    const context = createExecutionContextFixture(true);
    const claims = createExecutionCapability({
      allowedPaths: ["src/components/card.tsx"],
      checks: [],
      baseCommit: "a".repeat(40),
      changeRequestID: "1",
      executionKey: "job-1",
      planHash: "b".repeat(64),
      scopeHash: "c".repeat(64),
      version: 1,
      ttlSeconds: 300,
      executionContextHash: context.contextHash,
    });
    const secret = "fixture-only-system-release-signing-secret";
    const issued = issueExecutionCapability(claims, secret);
    expect(
      verifyExecutionCapability({
        claims,
        expectedTokenHash: issued.tokenHash,
        secret,
      }),
    ).toBe(true);
    expect(
      verifyExecutionCapability({
        claims: { ...claims, executionContextHash: "d".repeat(64) },
        expectedTokenHash: issued.tokenHash,
        secret,
      }),
    ).toBe(false);
    const decision = {
      actorID: "7",
      actorRoles: ["admin"],
      changeRequestID: "1",
      decision: "approved" as const,
      expiresAt: "2099-01-01",
      planHash: claims.planHash,
      scopeHash: claims.scopeHash,
      version: 1,
    };
    expect(
      createPlanApprovalBinding({
        ...decision,
        executionContextHash: context.contextHash,
      }),
    ).not.toBe(
      createPlanApprovalBinding({
        ...decision,
        executionContextHash: "d".repeat(64),
      }),
    );
    expect(() =>
      parseAIExecutionContext({ ...context, inputContextHash: "d".repeat(64) }),
    ).toThrow("integrity");
    expect(() => parseAIExecutionContext(undefined)).toThrow("original");
  });
});

describe("server protected runtime resources", () => {
  it.each([
    "AGENTS.md",
    "AGENTS.override.md",
    ".ai/rules/test.md",
    ".codex/config.toml",
    ".github/workflows/ci.yml",
    ".env.production",
    "src/theme/.env",
    "src/theme/AGENTS.md",
    "src/theme/.codex/config.toml",
    "src/keys/token.pem",
    "src/access/check.ts",
    "package.json",
    "packages/ai-contracts/src/index.ts",
    "src/**",
    "../src/file.ts",
    "src/../AGENTS.md",
    "src//file.ts",
    "./AGENTS.md",
    "C:/project/file.ts",
    "src\\file.ts",
  ])("blocks %s before issuing permission and in the diff", (path) => {
    expect(
      assessExecutionScope({
        affectedPaths: [path],
        checks: [],
        type: "CODE_CHANGE",
      }).allowed,
    ).toBe(false);
    expect(pathMatchesExecutionScope(path, [path])).toBe(false);
  });
  it("permits bounded client code and denies protected names inside a directory scope", () => {
    expect(
      assessExecutionScope({
        affectedPaths: ["src/components/**"],
        checks: ["npm run typecheck"],
        type: "CODE_CHANGE",
      }).allowed,
    ).toBe(true);
    expect(
      pathMatchesExecutionScope("src/components/card.tsx", [
        "src/components/**",
      ]),
    ).toBe(true);
    expect(
      pathMatchesExecutionScope("src/app/(app)/[slug]/page.tsx", [
        "src/app/(app)/[slug]/page.tsx",
      ]),
    ).toBe(true);
    expect(
      pathMatchesExecutionScope("src/components/AGENTS.md", [
        "src/components/**",
      ]),
    ).toBe(false);
    expect(
      pathMatchesExecutionScope("src/components/.env.local", [
        "src/components/**",
      ]),
    ).toBe(false);
    expect(
      assessExecutionScope({
        affectedPaths: ["src/components/card.tsx"],
        checks: ["npm run arbitrary"],
        type: "CODE_CHANGE",
      }).allowed,
    ).toBe(false);
  });
});
