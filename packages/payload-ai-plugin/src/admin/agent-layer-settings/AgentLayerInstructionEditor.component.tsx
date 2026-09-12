/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerInstructionEditor.component.tsx
 * @version 1.0.1
 * @date 2026-09-10
 * @description Отображает типизированные поля ролей, навыков и шаблонов с общим выбором возможностей.
 */

import type { AIPromptTemplateDefinition } from "@realize/ai-contracts";
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
import type { AgentLayerInstructionEditorProps } from "./AgentLayerInstructionEditor.types";
import { AgentLayerReferencePicker } from "./AgentLayerReferencePicker.component";
import formStyles from "./AgentLayerProfileEditor.module.css";
import styles from "./AgentLayerInstructionEditor.module.css";

// Пустые строки и повторы остаются во вводе до явного исправления пользователем.
const splitLines = (value: string): readonly string[] =>
  value === "" ? [] : value.split("\n");

/** Общий editor сохраняет discriminated input и защищает переходы от потери формы. */
export const AgentLayerInstructionEditor = ({
  draft,
  editor,
  onOpen,
  onCopy,
}: AgentLayerInstructionEditorProps) => {
  const id = useId();
  const form = editor.instructionForm;
  if (!form) return null;
  const { fields } = form;
  const disabled = editor.isReadOnly || editor.isLocked;
  const enabledLabel =
    fields.kind === "local_role"
      ? "Роль включена"
      : fields.kind === "skill"
        ? "Навык включён"
        : "Шаблон включён";
  const saveLabel =
    fields.kind === "local_role"
      ? "Сохранить роль"
      : fields.kind === "skill"
        ? "Сохранить навык"
        : "Сохранить шаблон";
  return (
    <UiSurface appearance="flush">
      <form
        className={formStyles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void editor.save();
        }}
      >
        <section
          className={formStyles.section}
          aria-labelledby={`${id}-basics`}
        >
          <div className={formStyles.sectionHeader}>
            <div>
              <h3 id={`${id}-basics`}>Основные сведения</h3>
              <p className={formStyles.muted}>
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
          <div className={formStyles.fieldGrid}>
            <label className={formStyles.field} htmlFor={`${id}-title`}>
              <span>Название</span>
              <UiInput
                id={`${id}-title`}
                value={fields.title}
                disabled={disabled}
                onChange={(event) =>
                  editor.updateInstruction({
                    ...fields,
                    title: event.target.value,
                  })
                }
                required
                maxLength={120}
                autoComplete="off"
              />
            </label>
            <label className={formStyles.field} htmlFor={`${id}-key`}>
              <span id={`${id}-key-label`}>Ключ</span>
              <UiInput
                id={`${id}-key`}
                value={fields.key}
                disabled={disabled}
                readOnly={Boolean(form.originalKey)}
                onChange={(event) =>
                  editor.updateInstruction({
                    ...fields,
                    key: event.target.value,
                  })
                }
                required
                maxLength={128}
                pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,127}"
                autoComplete="off"
                spellCheck={false}
                aria-labelledby={`${id}-key-label`}
                aria-describedby={`${id}-key-hint`}
              />
              <small className={formStyles.muted} id={`${id}-key-hint`}>
                {form.originalKey
                  ? "Сохранённый ключ не меняется."
                  : "Латинские буквы, цифры, точка, дефис и подчёркивание."}
              </small>
            </label>
          </div>
          {fields.kind === "skill" && (
            <label className={formStyles.field} htmlFor={`${id}-description`}>
              <span id={`${id}-description-label`}>Назначение</span>
              <UiTextarea
                id={`${id}-description`}
                className={formStyles.description}
                value={fields.description}
                disabled={disabled}
                onChange={(event) =>
                  editor.updateInstruction({
                    ...fields,
                    description: event.target.value,
                  })
                }
                required
                maxLength={2000}
                rows={4}
                aria-labelledby={`${id}-description-label`}
                aria-describedby={`${id}-description-hint`}
              />
              <small id={`${id}-description-hint`} className={formStyles.muted}>
                {fields.description.length} / 2000 символов
              </small>
            </label>
          )}
          <label className={formStyles.switchRow}>
            <span>
              <strong id={`${id}-enabled-label`}>{enabledLabel}</strong>
              <small className={formStyles.muted} id={`${id}-enabled-hint`}>
                Состояние сохраняется в выбранном черновике.
              </small>
            </span>
            <UiSwitch
              checked={fields.enabled}
              disabled={disabled}
              onChange={(event) =>
                editor.updateInstruction({
                  ...fields,
                  enabled: event.target.checked,
                })
              }
              aria-labelledby={`${id}-enabled-label`}
              aria-describedby={`${id}-enabled-hint`}
            />
          </label>
        </section>
        <section
          className={formStyles.section}
          aria-labelledby={`${id}-content`}
        >
          <div className={formStyles.sectionHeader}>
            <div>
              <h3 id={`${id}-content`}>
                {fields.kind === "prompt_template"
                  ? "Содержание шаблона"
                  : "Инструкции"}
              </h3>
              <p className={formStyles.muted}>
                {fields.kind === "prompt_template"
                  ? "Текст шаблона, его назначение и именованные переменные."
                  : fields.kind === "skill"
                    ? "Порядок выполнения навыка и фразы для его применения."
                    : "Обязанности и порядок работы агента в этой роли."}
              </p>
            </div>
          </div>
          {fields.kind === "prompt_template" ? (
            <>
              <label className={formStyles.field} htmlFor={`${id}-slot`}>
                <span>Назначение шаблона</span>
                <UiSelect
                  id={`${id}-slot`}
                  value={fields.slot}
                  disabled={disabled}
                  onChange={(event) =>
                    editor.updateInstruction({
                      ...fields,
                      slot: event.target
                        .value as AIPromptTemplateDefinition["slot"],
                    })
                  }
                >
                  <option value="agent_instructions">Инструкции агента</option>
                  <option value="planner">Планирование</option>
                  <option value="reviewer">Рецензирование</option>
                  <option value="workflow_step">Шаг рабочего процесса</option>
                </UiSelect>
              </label>
              <label className={formStyles.field} htmlFor={`${id}-template`}>
                <span id={`${id}-template-label`}>Текст шаблона</span>
                <UiTextarea
                  id={`${id}-template`}
                  className={`${styles.textEditor} ${styles.template}`}
                  value={fields.template}
                  disabled={disabled}
                  onChange={(event) =>
                    editor.updateInstruction({
                      ...fields,
                      template: event.target.value,
                    })
                  }
                  required
                  maxLength={32000}
                  rows={12}
                  spellCheck={false}
                  aria-labelledby={`${id}-template-label`}
                  aria-describedby={`${id}-template-hint`}
                />
                <small id={`${id}-template-hint`} className={formStyles.muted}>
                  {fields.template.length} / 32000 символов. Для переменной
                  используйте {"{{request}}"}.
                </small>
              </label>
              <label className={formStyles.field} htmlFor={`${id}-variables`}>
                <span id={`${id}-variables-label`}>Переменные</span>
                <UiTextarea
                  id={`${id}-variables`}
                  className={`${styles.lineList} ${styles.template}`}
                  value={fields.variables.join("\n")}
                  disabled={disabled}
                  onChange={(event) =>
                    editor.updateInstruction({
                      ...fields,
                      variables: splitLines(event.target.value),
                    })
                  }
                  rows={5}
                  spellCheck={false}
                  placeholder="request"
                  aria-labelledby={`${id}-variables-label`}
                  aria-describedby={`${id}-variables-hint`}
                />
                <small id={`${id}-variables-hint`} className={formStyles.muted}>
                  По одному имени на строку, без фигурных скобок. До 128 имён.
                  Состав должен совпадать с переменными в тексте шаблона; это
                  проверяется при проверке черновика.{" "}
                  {fields.slot === "agent_instructions"
                    ? "В чате доступны request, context, profile_key, profile_title и locale."
                    : "Шаблоны этого назначения сохранены для будущих рабочих процессов и пока не применяются в чате."}
                </small>
              </label>
            </>
          ) : (
            <>
              <label
                className={formStyles.field}
                htmlFor={`${id}-instructions`}
              >
                <span id={`${id}-instructions-label`}>
                  {fields.kind === "local_role"
                    ? "Инструкции роли"
                    : "Инструкции навыка"}
                </span>
                <UiTextarea
                  id={`${id}-instructions`}
                  className={styles.textEditor}
                  value={fields.instructions}
                  disabled={disabled}
                  onChange={(event) =>
                    editor.updateInstruction({
                      ...fields,
                      instructions: event.target.value,
                    })
                  }
                  required
                  maxLength={16000}
                  rows={10}
                  aria-labelledby={`${id}-instructions-label`}
                  aria-describedby={`${id}-instructions-hint`}
                />
                <small
                  id={`${id}-instructions-hint`}
                  className={formStyles.muted}
                >
                  {fields.instructions.length} / 16000 символов
                </small>
              </label>
              {fields.kind === "skill" && (
                <label className={formStyles.field} htmlFor={`${id}-triggers`}>
                  <span id={`${id}-triggers-label`}>
                    Фразы для применения навыка
                  </span>
                  <UiTextarea
                    id={`${id}-triggers`}
                    className={styles.lineList}
                    value={fields.triggerTerms.join("\n")}
                    disabled={disabled}
                    onChange={(event) =>
                      editor.updateInstruction({
                        ...fields,
                        triggerTerms: splitLines(event.target.value),
                      })
                    }
                    rows={5}
                    aria-labelledby={`${id}-triggers-label`}
                    aria-describedby={`${id}-triggers-hint`}
                  />
                  <small
                    id={`${id}-triggers-hint`}
                    className={formStyles.muted}
                  >
                    По одной фразе на строку. До 128 фраз, каждая — до 120
                    символов.
                  </small>
                </label>
              )}
            </>
          )}
        </section>
        {fields.kind !== "prompt_template" && (
          <AgentLayerReferencePicker
            accordionName={`${id}-capabilities`}
            artifacts={draft.artifacts}
            kind="capability_binding"
            label="Возможности"
            description={
              fields.kind === "local_role"
                ? "Возможности, выбранные для выполнения этой роли."
                : "Возможности, на которые ссылается навык."
            }
            selectedKeys={fields.capabilityBindingKeys}
            sourceEnabled={fields.enabled}
            disabled={disabled}
            navigationDisabled={editor.isLocked}
            onChange={(keys) =>
              editor.updateInstruction({
                ...fields,
                capabilityBindingKeys: keys,
              })
            }
            onOpen={onOpen}
          />
        )}
        {editor.instructionNotice && (
          <p className={formStyles.muted} role="status">
            {editor.instructionNotice}
          </p>
        )}
        {editor.formError && (
          <UiNotice tone="danger" role="alert">
            {editor.formError}
          </UiNotice>
        )}
        <div className={formStyles.formActions}>
          <UiButton type="submit" disabled={disabled || !editor.isDirty}>
            {saveLabel}
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
