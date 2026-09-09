/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/validateRuntimeGitHubIntegration.validator.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Требует API credential у проверенного подключения GitHub для REST-потребителей.
 */

import { IntegrationRuntimeError } from "./IntegrationRuntime.error";
import type {
  GitHubIntegrationRow,
  ValidatedGitHubIntegration,
} from "./IntegrationRuntime.types";
import { validateRuntimeGitHubConfiguration } from "./validateRuntimeGitHubConfiguration.validator";

export const validateRuntimeGitHubIntegration = (
  row: GitHubIntegrationRow | undefined,
): ValidatedGitHubIntegration => {
  const integration = validateRuntimeGitHubConfiguration(row);
  if (integration.state !== "ready") return integration;
  if (
    !integration.credentialEnvelope ||
    typeof integration.credentialEnvelope !== "string"
  ) {
    throw new IntegrationRuntimeError(
      "Enabled GitHub integration has no credential.",
    );
  }
  return {
    ...(integration.defaultBranch
      ? { defaultBranch: integration.defaultBranch }
      : {}),
    credentialEnvelope: integration.credentialEnvelope,
    repositorySlug: integration.repositorySlug,
    revision: integration.revision,
    state: "ready",
  };
};
