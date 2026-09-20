/**
 * @file src/components/admin/task-manager/reference/WorkspaceGeneralFields.component.tsx
 * @version 1.0.0
 * @date 2026-09-18
 * @description Отображает единую полную форму создания и общих настроек рабочей среды.
 * @see documentation/specifications/task-management.md
 */

import { UiButton, UiInput, UiSelect, UiTextarea } from "@realize/ui-kit";
import {
  workspaceColors,
  workspaceDays,
  workspaceIcons,
  workspaceIconLabels,
  workspaceTimezones,
} from "./taskWorkspace.constants";
import type { WorkspaceGeneralFieldsProps } from "./WorkspaceViews.types";
import type { WorkspaceDraft } from "./taskWorkspace.types";
import styles from "./Workspace.module.css";

export function WorkspaceGeneralFields({
  composer,
  disabled,
  includeAccess = true,
}: WorkspaceGeneralFieldsProps) {
  const { draft, change, error, fieldErrors, errorRef } = composer;
  const Icon = workspaceIcons[draft.icon];
  return (
    <div className={styles.formFields}>
      {error ? (
        <div className={styles.error} role="alert" tabIndex={-1} ref={errorRef}>
          {error}
          <ul>
            {Object.values(fieldErrors).map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <fieldset className={styles.fieldset} disabled={disabled}>
        <label className={styles.field}>
          <span>
            Название <span aria-hidden="true">*</span>
          </span>
          <UiInput
            value={draft.name}
            onChange={(event) => change("name", event.target.value)}
            maxLength={100}
            required
            aria-invalid={Boolean(fieldErrors.name)}
            placeholder="Например, Продуктовая команда"
          />
        </label>
        <label className={styles.field}>
          <span>Описание</span>
          <UiTextarea
            value={draft.description}
            onChange={(event) => change("description", event.target.value)}
            maxLength={600}
            rows={3}
            placeholder="Чем занимается команда и какие проекты здесь собраны"
          />
        </label>
        <div className={styles.appearance}>
          <span className={styles.workspaceAvatar} data-color={draft.color}>
            <Icon size={24} aria-hidden="true" />
          </span>
          <div className={styles.appearanceFields}>
            <fieldset className={styles.choices}>
              <legend>Цвет</legend>
              {workspaceColors.map((color) => (
                <UiButton
                  key={color.value}
                  variant="ghost"
                  size="icon"
                  className={styles.colorChoice}
                  data-color={color.value}
                  aria-label={color.label}
                  aria-pressed={draft.color === color.value}
                  onClick={() => change("color", color.value)}
                >
                  <span />
                </UiButton>
              ))}
            </fieldset>
            <fieldset className={styles.choices}>
              <legend>Значок</legend>
              {Object.entries(workspaceIcons).map(([key, ItemIcon]) => (
                <UiButton
                  key={key}
                  variant="ghost"
                  size="icon"
                  aria-label={
                    workspaceIconLabels[key as keyof typeof workspaceIcons]
                  }
                  aria-pressed={draft.icon === key}
                  onClick={() => change("icon", key as WorkspaceDraft["icon"])}
                >
                  <ItemIcon size={17} aria-hidden="true" />
                </UiButton>
              ))}
            </fieldset>
          </div>
        </div>
        <label className={styles.field}>
          <span>Часовой пояс</span>
          <UiSelect
            value={draft.timezone}
            onChange={(event) => change("timezone", event.target.value)}
          >
            {[...new Set([...workspaceTimezones, draft.timezone])].map(
              (zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ),
            )}
          </UiSelect>
          <small>
            Используется как часовой пояс среды. Существующие сроки задач
            сохраняются.
          </small>
        </label>
        <fieldset className={styles.choices}>
          <legend>Рабочие дни</legend>
          {workspaceDays.map((day, index) => (
            <UiButton
              key={day}
              variant="secondary"
              size="small"
              aria-pressed={draft.workingDays.includes(index + 1)}
              onClick={() =>
                change(
                  "workingDays",
                  draft.workingDays.includes(index + 1)
                    ? draft.workingDays.filter((value) => value !== index + 1)
                    : [...draft.workingDays, index + 1].sort((a, b) => a - b),
                )
              }
            >
              {day}
            </UiButton>
          ))}
        </fieldset>
        {includeAccess ? (
          <label className={styles.field}>
            <span>Доступ к среде</span>
            <UiSelect
              value={draft.visibility}
              onChange={(event) =>
                change(
                  "visibility",
                  event.target.value as WorkspaceDraft["visibility"],
                )
              }
            >
              <option value="private">Только участники</option>
              <option value="internal">Всем в команде — просмотр</option>
            </UiSelect>
            <small>Право редактирования задаётся ролью участника.</small>
          </label>
        ) : null}
      </fieldset>
    </div>
  );
}
