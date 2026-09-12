/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerRuleEditor.component.tsx
 * @version 1.0.1
 * @date 2026-09-10
 * @description Отображает редактирование правила со стабильным ключом и проверкой зависимых профилей.
 */

import {
  UiButton,
  UiInput,
  UiNotice,
  UiSurface,
  UiSwitch,
  UiTextarea,
} from "@realize/ui-kit";
import { useId } from "react";
import type { AgentLayerRuleEditorProps } from "./AgentLayerPanels.types";
import { getAgentLayerRuleReferences } from "./getAgentLayerRuleReferences.util";
import styles from "./AgentLayerSettings.module.css";

export const AgentLayerRuleEditor = ({
  draft,
  editor,
}: AgentLayerRuleEditorProps) => {
  const id = useId();
  const { form } = editor;
  if (!form) return null;
  const references = form.originalKey
    ? getAgentLayerRuleReferences(draft, form.originalKey)
    : [];
  const disabled = editor.isReadOnly || editor.isLocked;
  return (
    <UiSurface appearance="flush" className={styles.ruleEditor}>
      <form
        className={styles.stack}
        onSubmit={(event) => {
          event.preventDefault();
          void editor.save();
        }}
      >
        <div className={styles.fieldGrid}>
          <label className={styles.field} htmlFor={`${id}-key`}>
            <span id={`${id}-key-label`}>Ключ</span>
            <UiInput
              id={`${id}-key`}
              value={form.fields.key}
              readOnly={Boolean(form.originalKey)}
              disabled={disabled}
              onChange={(event) => editor.update("key", event.target.value)}
              required
              maxLength={128}
              pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,127}"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`${id}-key-hint`}
              aria-labelledby={`${id}-key-label`}
            />
            <small id={`${id}-key-hint`} className={styles.muted}>
              {form.originalKey
                ? "Сохранённый ключ не меняется."
                : "Латинские буквы, цифры, точка, дефис и подчёркивание."}
            </small>
          </label>
          <label className={styles.field} htmlFor={`${id}-priority`}>
            <span id={`${id}-priority-label`}>Приоритет</span>
            <UiInput
              id={`${id}-priority`}
              type="number"
              value={form.fields.priority}
              disabled={disabled}
              onChange={(event) =>
                editor.update("priority", event.target.value)
              }
              min={0}
              max={100}
              step={1}
              required
              aria-describedby={`${id}-priority-hint`}
              aria-labelledby={`${id}-priority-label`}
            />
            <small id={`${id}-priority-hint`} className={styles.muted}>
              Целое число от 0 до 100.
            </small>
          </label>
        </div>
        <label className={styles.field} htmlFor={`${id}-title`}>
          <span>Название</span>
          <UiInput
            id={`${id}-title`}
            value={form.fields.title}
            disabled={disabled}
            onChange={(event) => editor.update("title", event.target.value)}
            required
            maxLength={120}
            autoComplete="off"
          />
        </label>
        <label className={styles.field} htmlFor={`${id}-instruction`}>
          <span id={`${id}-instruction-label`}>Инструкция</span>
          <UiTextarea
            className={styles.instruction}
            id={`${id}-instruction`}
            value={form.fields.instruction}
            disabled={disabled}
            onChange={(event) =>
              editor.update("instruction", event.target.value)
            }
            required
            maxLength={8000}
            rows={10}
            aria-describedby={`${id}-instruction-hint`}
            aria-labelledby={`${id}-instruction-label`}
          />
          <small id={`${id}-instruction-hint`} className={styles.muted}>
            {form.fields.instruction.length} / 8000 символов
          </small>
        </label>
        <label className={styles.switchRow}>
          <span>
            <strong id={`${id}-enabled-label`}>Правило включено</strong>
            <small id={`${id}-enabled-hint`} className={styles.muted}>
              Состояние сохраняется в выбранном черновике.
            </small>
          </span>
          <UiSwitch
            aria-labelledby={`${id}-enabled-label`}
            aria-describedby={`${id}-enabled-hint`}
            checked={form.fields.enabled}
            disabled={disabled}
            onChange={(event) => editor.update("enabled", event.target.checked)}
          />
        </label>
        {editor.formError && (
          <UiNotice tone="danger" role="alert">
            {editor.formError}
          </UiNotice>
        )}
        {references.length > 0 && (
          <p className={styles.muted}>
            Удаление недоступно: правило используется профилями. Связанные
            записи доступны в блоке «Используется в».
          </p>
        )}
        <div className={styles.formActions}>
          <div className={styles.inline}>
            <UiButton type="submit" disabled={disabled || !editor.isDirty}>
              Сохранить правило
            </UiButton>
            <UiButton
              variant="secondary"
              disabled={editor.isLocked || !editor.isDirty}
              onClick={editor.reset}
            >
              Сбросить
            </UiButton>
          </div>
          {form.originalKey && !editor.isReadOnly && (
            <UiButton
              variant="danger"
              disabled={editor.isLocked || references.length > 0}
              onClick={() => void editor.remove()}
            >
              Удалить правило
            </UiButton>
          )}
        </div>
      </form>
    </UiSurface>
  );
};
