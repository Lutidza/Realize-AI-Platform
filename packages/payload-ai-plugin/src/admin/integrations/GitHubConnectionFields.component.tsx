/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubConnectionFields.component.tsx
 * @version 1.0.3
 * @date 2026-09-09
 * @description Собирает управляемые секции репозитория, доступа и автора коммитов GitHub.
 */

"use client";

import { GitHubAccessFields } from "./GitHubAccessFields.component";
import { GitHubAuthorFields } from "./GitHubAuthorFields.component";
import type { GitHubConnectionFieldsProps } from "./GitHubConnectionFields.types";
import styles from "./IntegrationConnectionForm.module.css";
import { GitHubRepositoryFields } from "./GitHubRepositoryFields.component";

export const GitHubConnectionFields = ({
  commitAuthorEmail,
  commitAuthorError,
  commitAuthorErrorID,
  commitAuthorName,
  displayName,
  hasCredential,
  isDisabled,
  isEnabled,
  onCommitAuthorEmailChange,
  onCommitAuthorNameChange,
  onDisplayNameChange,
  onEnabledChange,
  onRepositoryURLChange,
  onTokenChange,
  repositoryURL,
  token,
}: GitHubConnectionFieldsProps) => (
  <div className={styles.formSections}>
    <GitHubRepositoryFields
      displayName={displayName}
      isDisabled={isDisabled}
      isEnabled={isEnabled}
      onDisplayNameChange={onDisplayNameChange}
      onEnabledChange={onEnabledChange}
      onRepositoryURLChange={onRepositoryURLChange}
      repositoryURL={repositoryURL}
    />
    <GitHubAccessFields
      hasCredential={hasCredential}
      isDisabled={isDisabled}
      onTokenChange={onTokenChange}
      token={token}
    />
    <GitHubAuthorFields
      commitAuthorEmail={commitAuthorEmail}
      commitAuthorError={commitAuthorError}
      commitAuthorErrorID={commitAuthorErrorID}
      commitAuthorName={commitAuthorName}
      isDisabled={isDisabled}
      onCommitAuthorEmailChange={onCommitAuthorEmailChange}
      onCommitAuthorNameChange={onCommitAuthorNameChange}
    />
  </div>
);
