/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflowInputFields.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Отображает ограниченный список входных параметров и форму одного выбранного значения.
 */

import { UiBadge, UiButton, UiInput } from "@realize/ui-kit";
import { Plus, Trash2 } from "lucide-react";
import type { AgentLayerWorkflowInputFieldsProps } from "./AgentLayerWorkflowEditor.types";
import { useAgentLayerWorkflowInputs } from "./useAgentLayerWorkflowInputs.hook";
import { AgentLayerChoiceList } from "./AgentLayerChoiceList.component";
import { AgentLayerWorkflowValueSourceEditor } from "./AgentLayerWorkflowValueSourceEditor.component";
import styles from "./AgentLayerProfileEditor.module.css";

/** Имена и значения строк сохраняются независимо, включая временные повторы имён. */
export const AgentLayerWorkflowInputFields = (
  props: AgentLayerWorkflowInputFieldsProps,
) => {
  const { id, step, steps, disabled, onOpenStep } = props;
  const input = useAgentLayerWorkflowInputs(props);
  const row = input.selected;
  return (
    <section className={styles.section} aria-labelledby={`${id}-inputs`}>
      <div className={styles.sectionHeader}>
        <div>
          <h3 id={`${id}-inputs`}>
            Входные параметры <UiBadge>{step.input.length} / 64</UiBadge>
          </h3>
          <p className={styles.muted}>
            Выберите параметр для редактирования имени и источника значения.
          </p>
        </div>
        <UiButton
          variant="secondary"
          size="small"
          disabled={disabled || step.input.length >= 64}
          onClick={input.add}
        >
          <Plus size={15} aria-hidden="true" />
          Добавить параметр
        </UiButton>
      </div>
      <AgentLayerChoiceList
        label="Входные параметры"
        picker={input.picker}
        emptyLabel="У шага пока нет входных параметров."
      />
      {row && (
        <section
          className={styles.section}
          aria-label="Редактирование параметра"
        >
          <div className={styles.sectionHeader}>
            <div>
              <h3>{row.key || "Новый параметр"}</h3>
            </div>
            <UiButton
              variant="ghost"
              size="small"
              disabled={disabled}
              onClick={input.remove}
            >
              <Trash2 size={15} aria-hidden="true" />
              Удалить параметр
            </UiButton>
          </div>
          <label className={styles.field} htmlFor={`${id}-input-key`}>
            <span>Имя параметра</span>
            <UiInput
              id={`${id}-input-key`}
              value={row.key}
              disabled={disabled}
              required
              maxLength={128}
              autoComplete="off"
              spellCheck={false}
              pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,127}"
              onChange={(event) =>
                input.update({ ...row, key: event.target.value })
              }
            />
          </label>
          <AgentLayerWorkflowValueSourceEditor
            id={`${id}-input-value`}
            label="Значение параметра"
            value={row.value}
            steps={steps}
            disabled={disabled}
            onChange={(value) => input.update({ ...row, value })}
            onOpenStep={onOpenStep}
          />
        </section>
      )}
    </section>
  );
};
