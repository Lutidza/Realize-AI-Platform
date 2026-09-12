/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerProfileEditor.component.tsx
 * @version 1.0.1
 * @date 2026-09-10
 * @description Отображает основные поля профиля и семь групп выбора связанных записей.
 */

import {
  UiButton,
  UiInput,
  UiNotice,
  UiSelect,
  UiSurface,
  UiSwitch,
  UiTextarea,
} from "@realize/ui-kit";
import { Copy } from "lucide-react";
import { useId } from "react";
import type { AgentLayerProfileEditorProps } from "./AgentLayerProfileEditor.types";
import { AgentLayerReferencePicker } from "./AgentLayerReferencePicker.component";
import { AGENT_LAYER_PROFILE_REFERENCES } from "./agentLayerProfileReferences.config";
import styles from "./AgentLayerProfileEditor.module.css";

/** Форма делегирует сохранение, копирование и защиту переходов общему editor owner. */
export const AgentLayerProfileEditor = ({
  draft,
  editor,
  onOpen,
  onCopy,
}: AgentLayerProfileEditorProps) => {
  const id = useId();
  const form = editor.profileForm;
  if (!form) return null;
  const { fields } = form;
  const disabled = editor.isLocked || editor.isReadOnly;
  const workflows = new Map(
    draft.artifacts
      .filter((artifact) => artifact.kind === "workflow_definition")
      .map((artifact) => [artifact.key, artifact]),
  );
  const workflowKeys = [...new Set(fields.workflowKeys)];
  const hasUnselectedDefault = Boolean(
    fields.defaultWorkflowKey &&
    !workflowKeys.includes(fields.defaultWorkflowKey),
  );
  return (
    <UiSurface appearance="flush">
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void editor.save();
        }}
      >
        <section className={styles.section} aria-labelledby={`${id}-basics`}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 id={`${id}-basics`}>Основные сведения</h3>
              <p className={styles.muted}>
                Название, назначение и состояние профиля в выбранном черновике.
              </p>
            </div>
            {form.originalKey && (
              <UiButton
                variant="secondary"
                size="small"
                disabled={disabled || draft.artifacts.length >= 512}
                title={
                  draft.artifacts.length >= 512
                    ? "Достигнут лимит 512 записей в черновике"
                    : undefined
                }
                onClick={onCopy}
              >
                <Copy size={15} aria-hidden="true" />
                Создать копию
              </UiButton>
            )}
          </div>
          <label className={styles.field} htmlFor={`${id}-title`}>
            <span>Название</span>
            <UiInput
              id={`${id}-title`}
              value={fields.title}
              disabled={disabled}
              onChange={(event) =>
                editor.updateProfile("title", event.target.value)
              }
              autoComplete="off"
              required
              maxLength={120}
            />
          </label>
          <label className={styles.field} htmlFor={`${id}-description`}>
            <span id={`${id}-description-label`}>Назначение</span>
            <UiTextarea
              id={`${id}-description`}
              className={styles.description}
              value={fields.description}
              disabled={disabled}
              onChange={(event) =>
                editor.updateProfile("description", event.target.value)
              }
              required
              maxLength={2000}
              rows={4}
              aria-labelledby={`${id}-description-label`}
              aria-describedby={`${id}-description-hint`}
            />
            <small id={`${id}-description-hint`} className={styles.muted}>
              {fields.description.length} / 2000 символов
            </small>
          </label>
          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor={`${id}-key`}>
              <span id={`${id}-key-label`}>Ключ</span>
              <UiInput
                id={`${id}-key`}
                value={fields.key}
                disabled={disabled}
                readOnly={Boolean(form.originalKey)}
                onChange={(event) =>
                  editor.updateProfile("key", event.target.value)
                }
                required
                maxLength={128}
                pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,127}"
                spellCheck={false}
                autoComplete="off"
                aria-labelledby={`${id}-key-label`}
                aria-describedby={`${id}-key-hint`}
              />
              <small className={styles.muted} id={`${id}-key-hint`}>
                {form.originalKey
                  ? "Сохранённый ключ не меняется."
                  : "Латинские буквы, цифры, точка, дефис и подчёркивание."}
              </small>
            </label>
            <label className={styles.field} htmlFor={`${id}-locale`}>
              <span id={`${id}-locale-label`}>Язык</span>
              <UiInput
                id={`${id}-locale`}
                value={fields.locale}
                disabled={disabled}
                onChange={(event) =>
                  editor.updateProfile("locale", event.target.value)
                }
                required
                minLength={2}
                maxLength={16}
                pattern="[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?"
                placeholder="ru-RU"
                spellCheck={false}
                autoComplete="off"
                aria-labelledby={`${id}-locale-label`}
                aria-describedby={`${id}-locale-hint`}
              />
              <small className={styles.muted} id={`${id}-locale-hint`}>
                Код языка, например ru-RU или en.
              </small>
            </label>
          </div>
          <label className={styles.switchRow}>
            <span>
              <strong id={`${id}-enabled-label`}>Профиль включён</strong>
              <small className={styles.muted} id={`${id}-enabled-hint`}>
                Включённый профиль должен ссылаться на включённые записи.
              </small>
            </span>
            <UiSwitch
              checked={fields.enabled}
              disabled={disabled}
              onChange={(event) =>
                editor.updateProfile("enabled", event.target.checked)
              }
              aria-labelledby={`${id}-enabled-label`}
              aria-describedby={`${id}-enabled-hint`}
            />
          </label>
        </section>
        <section
          className={styles.section}
          aria-labelledby={`${id}-references`}
        >
          <div className={styles.sectionHeader}>
            <div>
              <h3 id={`${id}-references`}>Состав профиля</h3>
              <p className={styles.muted}>
                Откройте группу, чтобы выбрать записи. Изменения связей
                сохраняются вместе с профилем.
              </p>
            </div>
          </div>
          <div className={styles.referenceGroups}>
            {AGENT_LAYER_PROFILE_REFERENCES.map((group) => (
              <AgentLayerReferencePicker
                key={group.field}
                accordionName={`${id}-profile-references`}
                artifacts={draft.artifacts}
                kind={group.kind}
                label={group.label}
                description={group.description}
                selectedKeys={fields[group.field]}
                sourceEnabled={fields.enabled}
                disabled={disabled}
                navigationDisabled={editor.isLocked}
                additionalProblemCount={
                  group.field === "workflowKeys" && hasUnselectedDefault ? 1 : 0
                }
                onChange={(keys) => editor.updateProfile(group.field, keys)}
                onOpen={onOpen}
              >
                {group.field === "workflowKeys" && (
                  <label
                    className={styles.field}
                    htmlFor={`${id}-default-workflow`}
                  >
                    <span id={`${id}-default-workflow-label`}>
                      Процесс по умолчанию
                    </span>
                    <UiSelect
                      id={`${id}-default-workflow`}
                      value={fields.defaultWorkflowKey ?? ""}
                      disabled={
                        disabled ||
                        (!workflowKeys.length && !fields.defaultWorkflowKey)
                      }
                      onChange={(event) =>
                        editor.updateProfile(
                          "defaultWorkflowKey",
                          event.target.value || undefined,
                        )
                      }
                      aria-invalid={hasUnselectedDefault || undefined}
                      aria-labelledby={`${id}-default-workflow-label`}
                      aria-describedby={`${id}-default-workflow-hint`}
                    >
                      <option value="">Не выбран</option>
                      {hasUnselectedDefault && (
                        <option value={fields.defaultWorkflowKey}>
                          Не входит в выбранные · {fields.defaultWorkflowKey}
                        </option>
                      )}
                      {workflowKeys.map((key) => {
                        const workflow = workflows.get(key);
                        return (
                          <option key={key} value={key}>
                            {workflow
                              ? `${workflow.title}${workflow.enabled ? "" : " · выключен"}`
                              : "Не найдено"}{" "}
                            · {key}
                          </option>
                        );
                      })}
                    </UiSelect>
                    <small
                      id={`${id}-default-workflow-hint`}
                      className={
                        hasUnselectedDefault
                          ? styles.fieldWarning
                          : styles.muted
                      }
                    >
                      {hasUnselectedDefault
                        ? "Процесс по умолчанию должен входить в выбранные процессы. Выберите другой или снимите значение."
                        : "Можно выбрать один из процессов, включённых в состав профиля."}
                    </small>
                  </label>
                )}
              </AgentLayerReferencePicker>
            ))}
          </div>
        </section>
        {editor.profileNotice && (
          <p className={styles.muted} role="status">
            {editor.profileNotice}
          </p>
        )}
        {editor.formError && (
          <UiNotice tone="danger" role="alert">
            {editor.formError}
          </UiNotice>
        )}
        <div className={styles.formActions}>
          <UiButton type="submit" disabled={disabled || !editor.isDirty}>
            Сохранить профиль
          </UiButton>
          <UiButton
            variant="secondary"
            disabled={editor.isLocked || !editor.isDirty}
            onClick={editor.reset}
          >
            Сбросить
          </UiButton>
        </div>
      </form>
    </UiSurface>
  );
};
