/**
 * @file packages/ai-contracts/src/parseGitHubIntegrationConfiguration.validator.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Проверяет конфигурацию GitHub и допустимые сочетания Git-транспорта.
 */

import type { GitIntegrationTransport } from "./GitIntegrationTransport.types";
import type { GitHubIntegrationConfigurationDTO } from "./integrations";
import { parseGitCommitAuthor } from "./parseGitCommitAuthor.validator";
import {
  ContractValidationError,
  parseGitHubRepositoryURL,
} from "./validation";

const configurationObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractValidationError(
      "GitHub configuration must be an object.",
    );
  }
  return value as Record<string, unknown>;
};

/** Старые записи без transport означают HTTPS; неправильное значение не включает fallback. */
export const parseGitIntegrationTransport = (
  value: unknown,
): GitIntegrationTransport => {
  const source = configurationObject(value);
  const transport = source.transport === undefined ? "https" : source.transport;
  if (transport === "https") {
    if (source.sshProfileRef !== undefined) {
      throw new ContractValidationError(
        "sshProfileRef is only allowed for SSH transport.",
      );
    }
    return { transport };
  }
  if (transport !== "ssh") {
    throw new ContractValidationError("Git transport must be https or ssh.");
  }
  if (
    typeof source.sshProfileRef !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(source.sshProfileRef)
  ) {
    throw new ContractValidationError(
      "sshProfileRef must be a bounded profile identifier.",
    );
  }
  return { transport, sshProfileRef: source.sshProfileRef };
};

/** Возвращает только каноническую идентичность и безопасные поля сохранённого подключения. */
export const parseGitHubIntegrationConfiguration = (
  value: unknown,
): GitHubIntegrationConfigurationDTO => {
  const source = configurationObject(value);
  const repository = parseGitHubRepositoryURL(source.repositoryURL);
  if (source.repositorySlug !== repository.repositorySlug) {
    throw new ContractValidationError(
      "Stored GitHub repository identity is inconsistent.",
    );
  }
  const defaultBranch = source.defaultBranch;
  if (
    defaultBranch !== undefined &&
    (typeof defaultBranch !== "string" ||
      !/^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._/-]{1,200}$/.test(defaultBranch))
  ) {
    throw new ContractValidationError(
      "Stored GitHub default branch is invalid.",
    );
  }
  return {
    ...repository,
    ...parseGitIntegrationTransport(source),
    ...(source.commitAuthor === undefined
      ? {}
      : { commitAuthor: parseGitCommitAuthor(source.commitAuthor) }),
    ...(defaultBranch ? { defaultBranch } : {}),
  };
};
