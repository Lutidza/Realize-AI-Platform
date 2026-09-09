/**
 * @file packages/payload-ai-plugin/src/integrations/runtime/validateRuntimeGitHubConfiguration.validator.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет актуальную запись GitHub независимо от способа получения credential.
 */

import {
  ContractValidationError,
  parseGitHubIntegrationConfiguration,
} from "@realize/ai-contracts";

import { PRIMARY_GITHUB_CONNECTION_KEY } from "../providers";
import { IntegrationRuntimeError } from "./IntegrationRuntime.error";
import type {
  GitHubIntegrationRow,
  ValidatedGitHubConfiguration,
} from "./IntegrationRuntime.types";

/** Отсутствие и отключение не требуют credential; остальные ошибки закрывают подключение. */
export const validateRuntimeGitHubConfiguration = (
  row: GitHubIntegrationRow | undefined,
): ValidatedGitHubConfiguration => {
  if (!row) return { state: "absent" };
  if (
    row.provider !== "github" ||
    row.connection_key !== PRIMARY_GITHUB_CONNECTION_KEY ||
    typeof row.enabled !== "boolean"
  ) {
    throw new IntegrationRuntimeError(
      "Stored GitHub integration identity is invalid.",
    );
  }
  if (!row.enabled) return { state: "disabled" };
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new IntegrationRuntimeError(
      "Stored GitHub integration revision is invalid.",
    );
  }
  try {
    return {
      ...parseGitHubIntegrationConfiguration(row.configuration),
      credentialEnvelope: row.credential_envelope,
      revision,
      state: "ready",
    };
  } catch (error) {
    if (error instanceof ContractValidationError) {
      throw new IntegrationRuntimeError(
        "Stored GitHub integration configuration is invalid.",
      );
    }
    throw error;
  }
};
