/**
 * @file packages/payload-ai-plugin/src/admin/integrations/GitHubRepositoryFields.component.tsx
 * @version 1.0.1
 * @date 2026-09-09
 * @description Отображает название, адрес репозитория и переключатель подключения GitHub.
 */

"use client";

import { UiInput, UiSurface, UiSwitch } from "@realize/ui-kit";
import { FolderGit2 } from "lucide-react";

import type { GitHubRepositoryFieldsProps } from "./GitHubConnectionFields.types";
import styles from "./IntegrationConnectionForm.module.css";
import { IntegrationFormSection } from "./IntegrationFormSection.component";

export const GitHubRepositoryFields = ({
  displayName,
  isDisabled,
  isEnabled,
  onDisplayNameChange,
  onEnabledChange,
  onRepositoryURLChange,
  repositoryURL,
}: GitHubRepositoryFieldsProps) => (
  <IntegrationFormSection
    description="Выберите репозиторий для работы с кодом проекта."
    icon={<FolderGit2 size={20} />}
    title="Репозиторий"
  >
    <div className={styles.formGrid}>
      <label className={styles.field}>
        <span>Название подключения</span>
        <UiInput
          autoComplete="off"
          disabled={isDisabled}
          maxLength={80}
          onChange={(event) => onDisplayNameChange(event.target.value)}
          placeholder="Основной GitHub"
          value={displayName}
        />
        <small>Понятное название для этого подключения.</small>
      </label>

      <label className={styles.field}>
        <span>Ссылка на репозиторий</span>
        <UiInput
          autoCapitalize="none"
          autoComplete="url"
          disabled={isDisabled}
          inputMode="url"
          onChange={(event) => onRepositoryURLChange(event.target.value)}
          placeholder="https://github.com/owner/repository"
          spellCheck={false}
          type="url"
          value={repositoryURL}
        />
        <small>HTTPS-адрес репозитория без пути к ветке или файлу.</small>
      </label>

      <UiSurface asChild tone="raised">
        <label className={styles.toggleField}>
          <span className={styles.toggleCopy}>
            <strong>Использовать подключение</strong>
            <small>
              Разрешить использование подключения для работы с GitHub.
            </small>
          </span>
          <UiSwitch
            checked={isEnabled}
            disabled={isDisabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
        </label>
      </UiSurface>
    </div>
  </IntegrationFormSection>
);
