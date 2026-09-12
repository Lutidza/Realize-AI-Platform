/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerBindingEditor.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Отображает общую форму привязки возможности или проверки с сохранением через редактор черновика.
 */

import {
  UiButton,
  UiInput,
  UiNotice,
  UiSurface,
  UiSwitch,
} from "@realize/ui-kit";
import { Copy } from "lucide-react";
import { useId } from "react";
import type { AgentLayerBindingEditorProps } from "./AgentLayerBindingEditor.types";
import { AgentLayerCapabilityFields } from "./AgentLayerCapabilityFields.component";
import { AgentLayerCheckFields } from "./AgentLayerCheckFields.component";
import styles from "./AgentLayerProfileEditor.module.css";

/** Save, reset, copy и блокировки принадлежат общему lifecycle редактора. */
export const AgentLayerBindingEditor = ({
  draft,
  system,
  editor,
  onCopy,
}: AgentLayerBindingEditorProps) => {
  const id = useId();
  const form = editor.bindingForm;
  if (!form) return null;
  const { fields } = form;
  const disabled = editor.isReadOnly || editor.isLocked;
  const isCapability = fields.kind === "capability_binding";
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
                Название и состояние записи в выбранном черновике.
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
          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor={`${id}-title`}>
              <span>Название</span>
              <UiInput
                id={`${id}-title`}
                value={fields.title}
                disabled={disabled}
                required
                maxLength={120}
                autoComplete="off"
                onChange={(event) =>
                  editor.updateBinding({ ...fields, title: event.target.value })
                }
              />
            </label>
            <label className={styles.field} htmlFor={`${id}-key`}>
              <span id={`${id}-key-label`}>Ключ</span>
              <UiInput
                id={`${id}-key`}
                value={fields.key}
                disabled={disabled}
                readOnly={Boolean(form.originalKey)}
                required
                maxLength={128}
                pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,127}"
                autoComplete="off"
                spellCheck={false}
                aria-labelledby={`${id}-key-label`}
                aria-describedby={`${id}-key-hint`}
                onChange={(event) =>
                  editor.updateBinding({ ...fields, key: event.target.value })
                }
              />
              <small className={styles.muted} id={`${id}-key-hint`}>
                {form.originalKey
                  ? "Сохранённый ключ не меняется."
                  : "Латинские буквы, цифры, точка, дефис и подчёркивание."}
              </small>
            </label>
          </div>
          <label className={styles.switchRow}>
            <span>
              <strong id={`${id}-enabled-label`}>
                {isCapability ? "Возможность включена" : "Проверка включена"}
              </strong>
              <small className={styles.muted} id={`${id}-enabled-hint`}>
                Состояние сохраняется в выбранном черновике.
              </small>
            </span>
            <UiSwitch
              checked={fields.enabled}
              disabled={disabled}
              aria-labelledby={`${id}-enabled-label`}
              aria-describedby={`${id}-enabled-hint`}
              onChange={(event) =>
                editor.updateBinding({
                  ...fields,
                  enabled: event.target.checked,
                })
              }
            />
          </label>
        </section>
        {fields.kind === "capability_binding" ? (
          <AgentLayerCapabilityFields
            id={id}
            fields={fields}
            system={system}
            disabled={disabled}
            onChange={editor.updateBinding}
          />
        ) : (
          <AgentLayerCheckFields
            id={id}
            fields={fields}
            system={system}
            disabled={disabled}
            onChange={editor.updateBinding}
          />
        )}
        {editor.bindingNotice && (
          <p className={styles.muted} role="status">
            {editor.bindingNotice}
          </p>
        )}
        {editor.formError && (
          <UiNotice tone="danger" role="alert">
            {editor.formError}
          </UiNotice>
        )}
        <div className={styles.formActions}>
          <UiButton type="submit" disabled={disabled || !editor.isDirty}>
            {isCapability ? "Сохранить возможность" : "Сохранить проверку"}
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
