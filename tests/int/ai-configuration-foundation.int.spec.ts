/**
 * @file tests/int/ai-configuration-foundation.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Проверяет capability registry и immutable installation AI config foundation.
 * @docref Realize AI Commerce v1.0 — AI plugin data model
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/21-ai-plugin-data-model.md
 */

import type { WorkflowDefinition } from "@realize/ai-contracts";
import {
  CATALOG_ASSIGN_CATEGORY_CAPABILITY,
  CapabilityRegistryError,
  SYSTEM_CAPABILITY_REGISTRY,
  SYSTEM_AI_CONFIG_PROJECTION,
  SYSTEM_AI_RELEASE,
  SYSTEM_CHECK_IDS,
  canonicalizeJSON,
  compileAgentConfiguration,
  createActiveAIConfigPointer,
  createCapabilityRegistry,
  hashCanonicalJSON,
  validateAIConfigDraft,
  validateWorkflowDefinition,
  verifyAIConfigRelease,
} from "@realize/change-engine";
import { describe, expect, it } from "vitest";

import {
  AI_CONFIG_ARTIFACTS,
  SYSTEM_AI_CONFIG_FIXTURE,
  createAIConfigDraftFixture,
  createAIConfigReleaseFixture,
} from "./fixtures/aiConfiguration";

describe("canonical AI configuration JSON", () => {
  it("sorts object keys but preserves array order and rejects non-JSON state", () => {
    expect(canonicalizeJSON({ b: 2, a: { y: 1, x: true } })).toBe(
      '{"a":{"x":true,"y":1},"b":2}',
    );
    expect(hashCanonicalJSON({ a: 1, b: 2 })).toBe(
      hashCanonicalJSON({ b: 2, a: 1 }),
    );
    expect(hashCanonicalJSON([1, 2])).not.toBe(hashCanonicalJSON([2, 1]));
    expect(() => canonicalizeJSON(new Date())).toThrow("plain object");
    expect(() => canonicalizeJSON(Array(1))).toThrow("data property");
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => canonicalizeJSON(circular)).toThrow("circular reference");
  });
});

describe("server capability registry", () => {
  it("registers the existing Data Lane adapter by exact immutable version", () => {
    expect(
      SYSTEM_CAPABILITY_REGISTRY.require({
        id: "catalog.assignCategory.v1",
        version: "1.0",
      }),
    ).toEqual(CATALOG_ASSIGN_CATEGORY_CAPABILITY);
    expect(
      SYSTEM_CAPABILITY_REGISTRY.get({
        id: "catalog.assignCategory.v1",
        version: "1.1",
      }),
    ).toBeUndefined();
    expect(Object.isFrozen(SYSTEM_CAPABILITY_REGISTRY.list()[0]?.actions)).toBe(
      true,
    );
    expect(
      Object.isFrozen(CATALOG_ASSIGN_CATEGORY_CAPABILITY.scopes.read),
    ).toBe(true);
    expect(() =>
      createCapabilityRegistry([
        CATALOG_ASSIGN_CATEGORY_CAPABILITY,
        CATALOG_ASSIGN_CATEGORY_CAPABILITY,
      ]),
    ).toThrow(CapabilityRegistryError);
    const malformed = structuredClone(CATALOG_ASSIGN_CATEGORY_CAPABILITY);
    Object.assign(malformed, { riskLevel: "R9" });
    expect(() => createCapabilityRegistry([malformed])).toThrow(
      "invalid policy values",
    );
  });

  it("publishes a content-addressed immutable system projection", () => {
    const { manifestHash, ...payload } = SYSTEM_AI_RELEASE;
    expect(SYSTEM_AI_CONFIG_PROJECTION.manifestHash).toBe(manifestHash);
    expect(manifestHash).toBe(hashCanonicalJSON(payload));
    expect(SYSTEM_AI_CONFIG_PROJECTION.capabilities).toEqual(
      SYSTEM_CAPABILITY_REGISTRY.list(),
    );
    expect(SYSTEM_AI_CONFIG_PROJECTION.checkIDs).toEqual(SYSTEM_CHECK_IDS);
    expect(Object.isFrozen(SYSTEM_AI_CONFIG_PROJECTION)).toBe(true);
    expect(Object.isFrozen(SYSTEM_AI_CONFIG_PROJECTION.capabilities)).toBe(
      true,
    );
  });
});

describe("installation AI configuration policy", () => {
  it("validates cross-references and rejects cyclic workflows", () => {
    expect(validateAIConfigDraft(createAIConfigDraftFixture())).toEqual({
      issues: [],
      valid: true,
    });
    const missingReference = structuredClone(AI_CONFIG_ARTIFACTS);
    const profile = missingReference.find(
      (artifact) => artifact.kind === "agent_profile",
    );
    if (!profile || profile.kind !== "agent_profile") {
      throw new Error("Agent profile fixture is missing.");
    }
    profile.workflowKeys = ["missing-workflow"];
    expect(
      validateAIConfigDraft(
        createAIConfigDraftFixture(missingReference),
      ).issues.map(({ code }) => code),
    ).toContain("config_reference_missing");
    const cyclic: WorkflowDefinition = {
      description: "Invalid cycle",
      enabled: true,
      entryStepKey: "loop",
      key: "cycle",
      kind: "workflow_definition",
      maxSteps: 1,
      revision: 1,
      steps: [
        {
          condition: {
            left: { source: "literal", value: true },
            operator: "exists",
          },
          falseStepKey: "loop",
          key: "loop",
          trueStepKey: "loop",
          type: "branch",
        },
      ],
      title: "Cycle",
    };
    expect(validateWorkflowDefinition(cyclic).map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "workflow_cycle_forbidden",
        "workflow_finish_missing",
      ]),
    );
  });

  it("creates deterministic immutable releases and versioned pointers", () => {
    const draft = createAIConfigDraftFixture();
    const release = createAIConfigReleaseFixture(draft);
    const reordered = createAIConfigReleaseFixture(
      createAIConfigDraftFixture([...AI_CONFIG_ARTIFACTS].reverse()),
    );

    expect(release.manifestHash).toBe(reordered.manifestHash);
    expect(verifyAIConfigRelease(release)).toBe(true);
    expect(Object.isFrozen(release.artifacts[0]?.artifact)).toBe(true);
    const tampered = structuredClone(release);
    Object.assign(tampered.artifacts[0]?.artifact || {}, { title: "tampered" });
    expect(verifyAIConfigRelease(tampered)).toBe(false);

    const first = createActiveAIConfigPointer({
      activatedAt: "2026-09-01T08:01:00.000Z",
      activatedBy: "admin-1",
      release,
    });
    const second = createActiveAIConfigPointer({
      activatedAt: "2026-09-01T08:02:00.000Z",
      activatedBy: "admin-1",
      previous: first,
      release,
    });
    expect(second).toEqual(
      expect.objectContaining({
        manifestHash: release.manifestHash,
        releaseID: release.id,
        version: 2,
      }),
    );
  });

  it("compiles all selected artifacts without weakening system policy", () => {
    const release = createAIConfigReleaseFixture();
    const compiled = compileAgentConfiguration({
      profileKey: "admin",
      release,
      system: SYSTEM_AI_CONFIG_FIXTURE,
    });

    expect(compiled.capabilities).toEqual([
      expect.objectContaining({
        actions: ["category.assign"],
        maxTargets: 1,
        readScopes: ["payload.products"],
      }),
    ]);
    expect(compiled.checkIDs).toEqual([...SYSTEM_CHECK_IDS].sort());
    expect(compiled.selectedArtifacts).toHaveLength(AI_CONFIG_ARTIFACTS.length);
    expect(compiled.compiledContextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(compiled.selectedArtifacts[0]?.artifact)).toBe(true);
    expect(
      compileAgentConfiguration({
        profileKey: "admin",
        release,
        system: { ...SYSTEM_AI_CONFIG_FIXTURE, releaseID: "system-v2" },
      }).compiledContextHash,
    ).not.toBe(compiled.compiledContextHash);

    const expanded = structuredClone(AI_CONFIG_ARTIFACTS);
    const binding = expanded.find(
      (artifact) => artifact.kind === "capability_binding",
    );
    if (!binding || binding.kind !== "capability_binding") {
      throw new Error("Capability binding fixture is missing.");
    }
    binding.allowedActions = ["category.delete"];
    expect(() =>
      compileAgentConfiguration({
        profileKey: "admin",
        release: createAIConfigReleaseFixture(
          createAIConfigDraftFixture(expanded),
        ),
        system: SYSTEM_AI_CONFIG_FIXTURE,
      }),
    ).toThrow("expands the system capability ceiling");
    expect(() =>
      compileAgentConfiguration({
        profileKey: "admin",
        release,
        system: {
          ...SYSTEM_AI_CONFIG_FIXTURE,
          checkIDs: ["payload.access"],
        },
      }),
    ).toThrow("not registered by the system");
  });
});
