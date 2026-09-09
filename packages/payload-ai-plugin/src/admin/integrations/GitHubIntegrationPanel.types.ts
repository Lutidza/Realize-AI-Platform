/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubIntegrationPanel.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт контракты панели GitHub и состояния полей автора коммитов.
 */

import type {
  GitHubIntegrationConnectionDTO,
  GitHubIntegrationTestDTO,
  SaveGitHubIntegrationInput,
  TestGitHubIntegrationInput,
} from "@realize/ai-contracts";

import type { useGitHubIntegrationForm } from "./useGitHubIntegrationForm.hook";

/** Панель получает безопасный DTO и операции существующего каталога интеграций. */
export type GitHubIntegrationPanelProps = {
  busyAction?: "disconnect" | "load" | "save" | "test";
  connection?: GitHubIntegrationConnectionDTO;
  onDisconnect: (revision: number) => Promise<boolean>;
  onSave: (
    input: SaveGitHubIntegrationInput,
  ) => Promise<GitHubIntegrationConnectionDTO | undefined>;
  onTest: (
    input: TestGitHubIntegrationInput,
  ) => Promise<GitHubIntegrationTestDTO | undefined>;
  vaultConfigured: boolean;
};

export type GitHubIntegrationPanelViewProps = Pick<
  GitHubIntegrationPanelProps,
  "busyAction" | "connection" | "vaultConfigured"
> & {
  form: ReturnType<typeof useGitHubIntegrationForm>;
};

export type GitHubCommitAuthorDraft = {
  email: string;
  name: string;
  sourceKey: string;
};
