/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflowStepCatalog.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Показывает каталог шагов с поиском, фильтрами состояния и добавлением выбранного типа.
 */

import { UiBadge, UiButton, UiSelect, UiSwitch } from "@realize/ui-kit";
import { Plus } from "lucide-react";
import type { AgentLayerWorkflowStepCatalogProps } from "./AgentLayerWorkflowEditor.types";
import { AGENT_LAYER_WORKFLOW_STEP_LABELS } from "./agentLayerWorkflowPresentation.config";
import { AgentLayerChoiceList } from "./AgentLayerChoiceList.component";
import styles from "./AgentLayerProfileEditor.module.css";
import layoutStyles from "./AgentLayerWorkflowEditor.module.css";

export const AgentLayerWorkflowStepCatalog = ({
  fields,
  workflow,
  disabled,
}: AgentLayerWorkflowStepCatalogProps) => (
  <section className={layoutStyles.catalog} aria-label="Каталог шагов">
    <div className={styles.sectionHeader}>
      <div>
        <h3>Шаги процесса</h3>
        <p className={styles.muted}>
          {fields.steps.length} / 64 · требуют внимания:{" "}
          {workflow.problemStepCount}
        </p>
      </div>
      <UiBadge>{fields.steps.length}</UiBadge>
    </div>
    <label className={styles.field}>
      <span>Тип нового шага</span>
      <UiSelect
        value={workflow.newType}
        disabled={disabled || fields.steps.length >= 64}
        onChange={(event) =>
          workflow.setNewType(event.target.value as typeof workflow.newType)
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
    <UiButton
      variant="secondary"
      disabled={disabled || fields.steps.length >= 64}
      onClick={workflow.addStep}
    >
      <Plus size={16} aria-hidden="true" />
      Добавить шаг
    </UiButton>
    <label className={styles.field}>
      <span>Тип шагов в списке</span>
      <UiSelect
        value={workflow.typeFilter}
        onChange={(event) =>
          workflow.setTypeFilter(
            event.target.value as typeof workflow.typeFilter,
          )
        }
      >
        <option value="all">Все типы</option>
        {Object.entries(AGENT_LAYER_WORKFLOW_STEP_LABELS).map(
          ([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ),
        )}
      </UiSelect>
    </label>
    <label className={styles.switchRow}>
      <span>
        <strong>Только требующие внимания</strong>
      </span>
      <UiSwitch
        checked={workflow.problemOnly}
        onChange={(event) => workflow.setProblemOnly(event.target.checked)}
        aria-label="Шаги, требующие внимания"
      />
    </label>
    <AgentLayerChoiceList
      label="Шаги процесса"
      picker={workflow.picker}
      emptyLabel="Добавьте первый шаг процесса."
    />
  </section>
);
