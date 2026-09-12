/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflowEditor.component.tsx
 * @version 1.0.1
 * @date 2026-09-11
 * @description Соединяет сведения процесса, каталог шагов и типизированную форму в одном сохранении черновика.
 */

import {
  UiButton,
  UiInput,
  UiNotice,
  UiSurface,
  UiSwitch,
  UiTextarea,
} from "@realize/ui-kit";
import { Copy } from "lucide-react";
import { useId } from "react";
import type { AgentLayerWorkflowEditorProps } from "./AgentLayerWorkflowEditor.types";
import { useAgentLayerWorkflowEditor } from "./useAgentLayerWorkflowEditor.hook";
import { AgentLayerWorkflowStepCatalog } from "./AgentLayerWorkflowStepCatalog.component";
import { AgentLayerWorkflowStepEditor } from "./AgentLayerWorkflowStepEditor.component";
import { AgentLayerWorkflowReferenceField } from "./AgentLayerWorkflowReferenceField.component";
import { AGENT_LAYER_WORKFLOW_STEP_LABELS } from "./agentLayerWorkflowPresentation.config";
import { getAgentLayerWorkflowFields } from "./getAgentLayerWorkflowFields.util";
import styles from "./AgentLayerProfileEditor.module.css";
import layoutStyles from "./AgentLayerWorkflowEditor.module.css";

/** Шаги редактируются локально, общий editor сохраняет весь workflow с CAS и защитой выхода. */
export const AgentLayerWorkflowEditor = ({
  draft,
  editor,
  onOpen,
  onCopy,
}: AgentLayerWorkflowEditorProps) => {
  const id = useId();
  const form = editor.workflowForm;
  const fields = form?.fields ?? getAgentLayerWorkflowFields();
  const disabled = editor.isReadOnly || editor.isLocked;
  const { selectedStepRef, ...workflow } = useAgentLayerWorkflowEditor({
    fields,
    artifacts: draft.artifacts,
    disabled,
    onChange: editor.updateWorkflow,
  });
  if (!form) return null;
  const pendingRename = fields.steps.find((step) => step.keyInput !== step.key);
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
                Назначение, состояние и ограничения процесса в выбранном
                черновике.
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
                  editor.updateWorkflow({
                    ...fields,
                    title: event.target.value,
                  })
                }
              />
            </label>
            <label className={styles.field} htmlFor={`${id}-key`}>
              <span id={`${id}-key-label`}>Ключ</span>
              <UiInput
                id={`${id}-key`}
                aria-labelledby={`${id}-key-label`}
                aria-describedby={`${id}-key-hint`}
                value={fields.key}
                disabled={disabled}
                readOnly={Boolean(form.originalKey)}
                required
                maxLength={128}
                pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,127}"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  editor.updateWorkflow({ ...fields, key: event.target.value })
                }
              />
              <small className={styles.muted} id={`${id}-key-hint`}>
                {form.originalKey
                  ? "Сохранённый ключ процесса не меняется."
                  : "Латинские буквы, цифры, точка, дефис и подчёркивание."}
              </small>
            </label>
          </div>
          <label className={styles.field} htmlFor={`${id}-description`}>
            <span id={`${id}-description-label`}>Назначение процесса</span>
            <UiTextarea
              id={`${id}-description`}
              aria-labelledby={`${id}-description-label`}
              aria-describedby={`${id}-description-hint`}
              className={styles.description}
              value={fields.description}
              disabled={disabled}
              maxLength={2000}
              rows={4}
              onChange={(event) =>
                editor.updateWorkflow({
                  ...fields,
                  description: event.target.value,
                })
              }
            />
            <small className={styles.muted} id={`${id}-description-hint`}>
              {fields.description.length} / 2000 символов
            </small>
          </label>
          <label className={styles.switchRow}>
            <span>
              <strong id={`${id}-enabled-label`}>Процесс включён</strong>
              <small className={styles.muted}>
                Состояние сохраняется в выбранном черновике.
              </small>
            </span>
            <UiSwitch
              checked={fields.enabled}
              disabled={disabled}
              aria-labelledby={`${id}-enabled-label`}
              onChange={(event) =>
                editor.updateWorkflow({
                  ...fields,
                  enabled: event.target.checked,
                })
              }
            />
          </label>
          <label className={styles.field} htmlFor={`${id}-max-steps`}>
            <span id={`${id}-max-steps-label`}>Лимит выполнения шагов</span>
            <UiInput
              id={`${id}-max-steps`}
              aria-labelledby={`${id}-max-steps-label`}
              aria-describedby={`${id}-max-steps-hint`}
              type="text"
              inputMode="numeric"
              value={fields.maxSteps}
              disabled={disabled}
              autoComplete="off"
              onChange={(event) =>
                editor.updateWorkflow({
                  ...fields,
                  maxSteps: event.target.value,
                })
              }
            />
            <small className={styles.muted} id={`${id}-max-steps-hint`}>
              От 1 до 64. Лимит должен вмещать все шаги процесса.
            </small>
          </label>
          <AgentLayerWorkflowReferenceField
            label="Начальный шаг"
            description="Шаг, с которого начинается процесс."
            options={fields.steps.map((step) => ({
              key: step.key,
              title: `${step.key} · ${AGENT_LAYER_WORKFLOW_STEP_LABELS[step.type]}`,
              canOpen: true,
            }))}
            value={fields.entryStepKey}
            disabled={disabled}
            onChange={(entryStepKey) =>
              editor.updateWorkflow({ ...fields, entryStepKey })
            }
            onOpen={(key) => {
              const step = fields.steps.find((item) => item.key === key);
              if (step) workflow.openStep(step.id);
            }}
          />
        </section>
        <div className={layoutStyles.workspace}>
          <AgentLayerWorkflowStepCatalog
            fields={fields}
            workflow={workflow}
            disabled={disabled}
          />
          <div
            className={layoutStyles.stepPane}
            ref={selectedStepRef}
            tabIndex={-1}
            role="region"
            aria-label="Выбранный шаг"
          >
            {workflow.selectedStep ? (
              <AgentLayerWorkflowStepEditor
                key={workflow.selectedStep.id}
                id={`${id}-step`}
                step={workflow.selectedStep}
                fields={fields}
                artifacts={draft.artifacts}
                workflow={workflow}
                disabled={disabled}
                navigationDisabled={editor.isLocked}
                onOpen={onOpen}
              />
            ) : (
              <UiNotice tone="neutral">
                Добавьте шаг, чтобы настроить его поля и переходы.
              </UiNotice>
            )}
          </div>
        </div>
        <p className={styles.muted}>
          Связи и поля отмечаются в редакторе. Полная проверка переходов, циклов
          и достижимости выполняется кнопкой «Проверить черновик» после
          сохранения. Опубликованный процесс можно явно выбрать и запустить в
          чате.
        </p>
        {pendingRename && (
          <UiNotice tone="neutral">
            Перед сохранением примените или отмените изменение ключа шага «
            {pendingRename.key}».{" "}
            <UiButton
              variant="ghost"
              size="small"
              onClick={() => workflow.openStep(pendingRename.id)}
            >
              Открыть шаг с изменением ключа
            </UiButton>
          </UiNotice>
        )}
        {editor.workflowNotice && (
          <p className={styles.muted} role="status">
            {editor.workflowNotice}
          </p>
        )}
        {editor.formError && (
          <UiNotice tone="danger" role="alert">
            {editor.formError}
          </UiNotice>
        )}
        <div className={styles.formActions}>
          <UiButton
            type="submit"
            disabled={disabled || !editor.isDirty || Boolean(pendingRename)}
          >
            Сохранить процесс
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
