/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubConnectionFields.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт управляемые поля подключения GitHub и автора коммитов.
 */

/** Поля не сохраняют настройки: значения и обработчики принадлежат хуку формы. */
export type GitHubConnectionFieldsProps = {
  commitAuthorEmail: string;
  commitAuthorError?: string;
  commitAuthorErrorID: string;
  commitAuthorName: string;
  displayName: string;
  hasCredential: boolean;
  isDisabled: boolean;
  isEnabled: boolean;
  onCommitAuthorEmailChange: (value: string) => void;
  onCommitAuthorNameChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
  onRepositoryURLChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  repositoryURL: string;
  token: string;
};
