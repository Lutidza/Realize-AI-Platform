/**
 * @file packages/ai-contracts/src/index.ts
 * @version 1.2.0
 * @date 2026-09-09
 * @description Экспортирует стабильный публичный API контрактов Realize AI.
 */

export * from "./agent";
export * from "./aiConfiguration";
export * from "./aiConfigurationAPI";
export * from "./aiConfigurationInputValidation";
export * from "./api";
export * from "./capabilities";
export * from "./dataOperations";
export * from "./dataOperationValidation";
export * from "./events";
export * from "./execution";
export * from "./integrations";
export * from "./CodexIntegration.types";
export * from "./parseCodexIntegration.validator";
export type { GitIntegrationTransport } from "./GitIntegrationTransport.types";
export type { GitCommitAuthor } from "./GitCommitAuthor.types";
export { parseGitCommitAuthor } from "./parseGitCommitAuthor.validator";
export {
  parseGitHubIntegrationConfiguration,
  parseGitIntegrationTransport,
} from "./parseGitHubIntegrationConfiguration.validator";
export * from "./preview";
export * from "./release";
export * from "./sourcePromotion";
export * from "./validation";
export * from "./workflows";
