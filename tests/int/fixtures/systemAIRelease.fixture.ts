/**
 * @file tests/int/fixtures/systemAIRelease.fixture.ts
 * @version 1.0.0
 * @date 2026-10-04
 * @description Собирает exact system/overlay snapshots для проверок runtime consumers.
 */
import {
  compileAgentConfiguration,
  createAIExecutionContext,
  hashCanonicalJSON,
  SYSTEM_AI_CONFIG_PROJECTION,
  SYSTEM_AI_RELEASE_REFERENCE,
} from "@realize/change-engine";
import { createAIConfigReleaseFixture } from "./aiConfiguration";

export const createRuntimeConfigurationFixture = () => {
  const release = createAIConfigReleaseFixture();
  return {
    schemaVersion: "1.0" as const,
    pointerVersion: 1,
    releaseVersion: release.version,
    compiled: compileAgentConfiguration({
      release,
      profileKey: "admin",
      system: SYSTEM_AI_CONFIG_PROJECTION,
    }),
  };
};

export const createExecutionContextFixture = (
  overlay = false,
  request = "fixture request",
) =>
  createAIExecutionContext({
    systemRelease: SYSTEM_AI_RELEASE_REFERENCE,
    ...(overlay
      ? { agentConfiguration: createRuntimeConfigurationFixture() }
      : {}),
    sourceRunID: "42",
    inputContextHash: "a".repeat(64),
    originalRequestHash: hashCanonicalJSON(request),
  });
