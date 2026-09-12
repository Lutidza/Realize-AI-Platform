/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflowStepEditor.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Отображает поля одного из шести видов шага с явными переходами и связями.
 */

import { UiButton, UiInput, UiNotice, UiSelect } from "@realize/ui-kit";
import { Copy, Trash2 } from "lucide-react";
import type { AIConfigArtifact } from "@realize/ai-contracts";
import type { AgentLayerWorkflowStepEditorProps } from "./AgentLayerWorkflowEditor.types";
import { AGENT_LAYER_WORKFLOW_STEP_LABELS } from "./agentLayerWorkflowPresentation.config";
import { AgentLayerWorkflowReferenceField } from "./AgentLayerWorkflowReferenceField.component";
import { AgentLayerWorkflowInputFields } from "./AgentLayerWorkflowInputFields.component";
import { AgentLayerWorkflowValueSourceEditor } from "./AgentLayerWorkflowValueSourceEditor.component";
import { createAgentLayerWorkflowValueSourceInput } from "./createAgentLayerWorkflowValueSourceInput.util";
import styles from "./AgentLayerProfileEditor.module.css";

/** Смена типа и ключа выполняются явными операциями; незавершённые поля остаются в общей форме. */
export const AgentLayerWorkflowStepEditor = ({
  id,
  step,
  fields,
  artifacts,
  workflow,
  disabled,
  navigationDisabled,
  onOpen,
}: AgentLayerWorkflowStepEditorProps) => {
  const stepOptions = fields.steps.map((item) => ({
    key: item.key,
    title: `${item.key} · ${AGENT_LAYER_WORKFLOW_STEP_LABELS[item.type]}`,
    canOpen: true,
  }));
  const openStepKey = (key: string) => {
    const target = fields.steps.find((item) => item.key === key);
    if (target) workflow.openStep(target.id);
  };
  const artifactField = (
    kind: AIConfigArtifact["kind"],
    label: string,
    value: string,
    onChange: (key: string) => void,
  ) => (
    <AgentLayerWorkflowReferenceField
      label={label}
      options={artifacts
        .filter((item) => item.kind === kind)
        .map((item) => ({
          key: item.key,
          title: item.title,
          code: item.key,
          inactive: !item.enabled,
          inactiveIsProblem: fields.enabled,
          canOpen: true,
        }))}
      value={value}
      disabled={disabled}
      navigationDisabled={navigationDisabled}
      onChange={onChange}
      onOpen={(key) => {
        const target = artifacts.find(
          (item) => item.kind === kind && item.key === key,
        );
        if (target) onOpen(target);
      }}
    />
  );
  return (
    <section className={styles.section} aria-label="Редактирование шага">
      <div className={styles.sectionHeader}>
        <div>
          <h3>
            {step.key} · {AGENT_LAYER_WORKFLOW_STEP_LABELS[step.type]}
          </h3>
          <p className={styles.muted}>
            Все изменения шага сохраняются вместе с процессом.
          </p>
        </div>
        <UiButton
          variant="secondary"
          size="small"
          disabled={disabled || fields.steps.length >= 64}
          onClick={workflow.copyStep}
        >
          <Copy size={15} aria-hidden="true" />
          Копировать шаг
        </UiButton>
      </div>
      <label className={styles.field} htmlFor={`${id}-step-key`}>
        <span id={`${id}-step-key-label`}>Ключ шага</span>
        <UiInput
          id={`${id}-step-key`}
          aria-labelledby={`${id}-step-key-label`}
          aria-describedby={`${id}-step-key-hint`}
          value={step.keyInput}
          disabled={disabled}
          maxLength={128}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) =>
            workflow.updateStep({ ...step, keyInput: event.target.value })
          }
        />
        <small className={styles.muted} id={`${id}-step-key-hint`}>
          Применение нового ключа обновит начальный шаг, переходы и ссылки на
          его результат.
        </small>
      </label>
      {step.keyInput !== step.key && (
        <div className={styles.formActions}>
          <UiButton
            variant="secondary"
            size="small"
            disabled={disabled}
            onClick={workflow.renameStep}
          >
            Применить ключ
          </UiButton>
          <UiButton
            variant="ghost"
            size="small"
            disabled={disabled}
            onClick={() => workflow.updateStep({ ...step, keyInput: step.key })}
          >
            Отменить изменение ключа
          </UiButton>
        </div>
      )}
      <label className={styles.field} htmlFor={`${id}-step-type`}>
        <span>Тип шага</span>
        <UiSelect
          id={`${id}-step-type`}
          value={step.type}
          disabled={disabled}
          onChange={(event) =>
            workflow.changeStepType(event.target.value as typeof step.type)
          }
        >
          {Object.entries(AGENT_LAYER_WORKFLOW_STEP_LABELS).map(
            ([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ),
          )}
        </UiSelect>
      </label>
      {workflow.error && (
        <UiNotice tone="danger" role="alert">
          {workflow.error}
        </UiNotice>
      )}
      {workflow.problems.length > 0 && (
        <UiNotice tone="danger" title="Шаг требует внимания">
          <ul
            className={styles.referenceRows}
            aria-label="Проблемы шага"
            tabIndex={0}
          >
            {workflow.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </UiNotice>
      )}
      {(step.type === "agent_turn" || step.type === "request_input") &&
        artifactField(
          "prompt_template",
          "Шаблон инструкции шага",
          step.promptTemplateKey,
          (promptTemplateKey) =>
            workflow.updateStep({ ...step, promptTemplateKey }),
        )}
      {step.type === "capability" && (
        <>
          {artifactField(
            "capability_binding",
            "Возможность шага",
            step.capabilityBindingKey,
            (capabilityBindingKey) =>
              workflow.updateStep({ ...step, capabilityBindingKey }),
          )}
          <AgentLayerWorkflowInputFields
            key={step.id}
            id={id}
            step={step}
            steps={fields.steps}
            disabled={disabled}
            onChange={workflow.updateStep}
            onOpenStep={workflow.openStep}
          />
        </>
      )}
      {step.type === "check" &&
        artifactField(
          "check_binding",
          "Проверка шага",
          step.checkBindingKey,
          (checkBindingKey) =>
            workflow.updateStep({ ...step, checkBindingKey }),
        )}
      {step.type === "branch" && (
        <>
          <AgentLayerWorkflowValueSourceEditor
            id={`${id}-left`}
            label="Левая часть условия"
            value={step.condition.left}
            steps={fields.steps}
            disabled={disabled}
            onChange={(left) =>
              workflow.updateStep({
                ...step,
                condition: { ...step.condition, left },
              })
            }
            onOpenStep={workflow.openStep}
          />
          <label className={styles.field} htmlFor={`${id}-operator`}>
            <span>Условие сравнения</span>
            <UiSelect
              id={`${id}-operator`}
              value={step.condition.operator}
              disabled={disabled}
              onChange={(event) =>
                workflow.updateStep({
                  ...step,
                  condition: {
                    ...step.condition,
                    operator: event.target
                      .value as typeof step.condition.operator,
                  },
                })
              }
            >
              <option value="equals">Равно</option>
              <option value="not_equals">Не равно</option>
              <option value="exists">Существует</option>
            </UiSelect>
          </label>
          {step.condition.right ? (
            <>
              <AgentLayerWorkflowValueSourceEditor
                id={`${id}-right`}
                label="Правая часть условия"
                value={step.condition.right}
                steps={fields.steps}
                disabled={disabled}
                onChange={(right) =>
                  workflow.updateStep({
                    ...step,
                    condition: { ...step.condition, right },
                  })
                }
                onOpenStep={workflow.openStep}
              />
              <UiButton
                variant="ghost"
                size="small"
                disabled={disabled}
                onClick={() =>
                  workflow.updateStep({
                    ...step,
                    condition: {
                      left: step.condition.left,
                      operator: step.condition.operator,
                    },
                  })
                }
              >
                Удалить правую часть
              </UiButton>
            </>
          ) : (
            step.condition.operator !== "exists" && (
              <UiButton
                variant="secondary"
                disabled={disabled}
                onClick={() =>
                  workflow.updateStep({
                    ...step,
                    condition: {
                      ...step.condition,
                      right:
                        createAgentLayerWorkflowValueSourceInput("literal"),
                    },
                  })
                }
              >
                Добавить правую часть
              </UiButton>
            )
          )}
          <AgentLayerWorkflowReferenceField
            label="Если условие выполнено"
            options={stepOptions}
            value={step.trueStepKey}
            disabled={disabled}
            onChange={(trueStepKey) =>
              workflow.updateStep({ ...step, trueStepKey })
            }
            onOpen={openStepKey}
          />
          <AgentLayerWorkflowReferenceField
            label="Если условие не выполнено"
            options={stepOptions}
            value={step.falseStepKey}
            disabled={disabled}
            onChange={(falseStepKey) =>
              workflow.updateStep({ ...step, falseStepKey })
            }
            onOpen={openStepKey}
          />
        </>
      )}
      {step.type === "finish" ? (
        <label className={styles.field} htmlFor={`${id}-outcome`}>
          <span>Результат завершения</span>
          <UiSelect
            id={`${id}-outcome`}
            value={step.outcome}
            disabled={disabled}
            onChange={(event) =>
              workflow.updateStep({
                ...step,
                outcome: event.target.value as typeof step.outcome,
              })
            }
          >
            <option value="completed">Выполнено</option>
            <option value="blocked">Заблокировано</option>
          </UiSelect>
        </label>
      ) : (
        step.type !== "branch" && (
          <AgentLayerWorkflowReferenceField
            label="Следующий шаг"
            options={stepOptions}
            value={step.nextStepKey}
            disabled={disabled}
            onChange={(nextStepKey) =>
              workflow.updateStep({ ...step, nextStepKey })
            }
            onOpen={openStepKey}
          />
        )
      )}
      <div className={styles.formActions}>
        <UiButton
          variant="ghost"
          size="small"
          disabled={disabled || Boolean(workflow.removalReason)}
          onClick={workflow.removeStep}
        >
          <Trash2 size={15} aria-hidden="true" />
          Удалить шаг
        </UiButton>
        {workflow.removalReason && (
          <p className={styles.muted}>{workflow.removalReason}</p>
        )}
      </div>
    </section>
  );
};
