/**
 * @file packages/payload-ai-plugin/src/integrations/providers.ts
 * @version 1.0.1
 * @date 2026-09-09
 * @docref ADR-0012, ADR-0013
 * @see documentation/architecture/decisions/ADR-0012-admin-integration-registry.md
 * @see documentation/architecture/decisions/ADR-0013-github-pull-request-source-promotion.md
 * @description Описывает безопасные метаданные реализованных интеграций GitHub и Codex.
 */

import type { IntegrationProviderDescriptorDTO } from "@realize/ai-contracts";

/** Stable key used by the first source-control connection and runtime consumer. */
export const PRIMARY_GITHUB_CONNECTION_KEY = "github:primary";

/** Стабильный installation-local ключ подключения Codex. */
export const PRIMARY_CODEX_CONNECTION_KEY = "codex:primary";

/** Safe provider descriptors; secrets and runtime configuration never belong here. */
export const INTEGRATION_PROVIDER_CATALOG: IntegrationProviderDescriptorDTO[] =
  [
    {
      capabilities: [
        "source",
        "pull-request",
        "candidate-ref",
        "workflow-dispatch",
      ],
      category: "development",
      description:
        "Репозиторий, draft Pull Requests, candidate refs и GitHub Actions.",
      id: "github",
      name: "GitHub",
    },
    {
      capabilities: ["chat", "coding", "chatgpt-account", "api-key"],
      category: "ai",
      description: "Codex через аккаунт ChatGPT или OpenAI API key.",
      id: "codex",
      name: "GPT — Codex",
    },
  ];
