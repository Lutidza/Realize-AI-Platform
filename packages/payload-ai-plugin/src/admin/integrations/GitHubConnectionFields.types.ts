/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubConnectionFields.types.ts
 * @version 1.0.1
 * @date 2026-09-09
 * @description Задаёт общий контракт полей подключения GitHub и свойства его секций.
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

export type GitHubRepositoryFieldsProps = Pick<
  GitHubConnectionFieldsProps,
  | "displayName"
  | "isDisabled"
  | "isEnabled"
  | "onDisplayNameChange"
  | "onEnabledChange"
  | "onRepositoryURLChange"
  | "repositoryURL"
>;

export type GitHubAccessFieldsProps = Pick<
  GitHubConnectionFieldsProps,
  "hasCredential" | "isDisabled" | "onTokenChange" | "token"
>;

export type GitHubAuthorFieldsProps = Pick<
  GitHubConnectionFieldsProps,
  | "commitAuthorEmail"
  | "commitAuthorError"
  | "commitAuthorErrorID"
  | "commitAuthorName"
  | "isDisabled"
  | "onCommitAuthorEmailChange"
  | "onCommitAuthorNameChange"
>;
