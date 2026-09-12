/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflowValueSourceEditor.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Отображает источник значения из ввода, результата шага или заданного литерала.
 */

import { UiInput, UiSelect } from "@realize/ui-kit";
import type { AgentLayerWorkflowValueSourceEditorProps } from "./AgentLayerWorkflowEditor.types";
import { AgentLayerWorkflowLiteralEditor } from "./AgentLayerWorkflowLiteralEditor.component";
import { AgentLayerWorkflowReferenceField } from "./AgentLayerWorkflowReferenceField.component";
import {
  AGENT_LAYER_WORKFLOW_SOURCE_LABELS,
  AGENT_LAYER_WORKFLOW_STEP_LABELS,
} from "./agentLayerWorkflowPresentation.config";
import { createAgentLayerWorkflowValueSourceInput } from "./createAgentLayerWorkflowValueSourceInput.util";
import styles from "./AgentLayerProfileEditor.module.css";

/** Путь вводится как данные; форма не предлагает исполняемые выражения. */
export const AgentLayerWorkflowValueSourceEditor = ({
  id,
  label,
  value,
  steps,
  disabled,
  onChange,
  onOpenStep,
}: AgentLayerWorkflowValueSourceEditorProps) => (
  <section className={styles.section} aria-labelledby={`${id}-source-label`}>
    <div className={styles.sectionHeader}>
      <div>
        <h3 id={`${id}-source-label`}>{label}</h3>
      </div>
    </div>
    <label className={styles.field} htmlFor={`${id}-source`}>
      <span>Источник значения</span>
      <UiSelect
        id={`${id}-source`}
        value={value.source}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            createAgentLayerWorkflowValueSourceInput(
              event.target.value as typeof value.source,
            ),
          )
        }
      >
        {Object.entries(AGENT_LAYER_WORKFLOW_SOURCE_LABELS).map(
          ([key, name]) => (
            <option value={key} key={key}>
              {name}
            </option>
          ),
        )}
      </UiSelect>
    </label>
    {value.source === "literal" ? (
      <AgentLayerWorkflowLiteralEditor
        id={id}
        value={value.value}
        disabled={disabled}
        onChange={(literal) => onChange({ source: "literal", value: literal })}
      />
    ) : (
      <>
        {value.source === "step_output" && (
          <AgentLayerWorkflowReferenceField
            label={`${label}: шаг-источник`}
            options={steps.map((step) => ({
              key: step.key,
              title: `${step.key} · ${AGENT_LAYER_WORKFLOW_STEP_LABELS[step.type]}`,
              canOpen: true,
            }))}
            value={value.stepKey}
            disabled={disabled}
            onChange={(stepKey) => onChange({ ...value, stepKey })}
            onOpen={(key) => {
              const step = steps.find((item) => item.key === key);
              if (step) onOpenStep(step.id);
            }}
          />
        )}
        <label className={styles.field} htmlFor={`${id}-path`}>
          <span id={`${id}-path-label`}>Путь к значению</span>
          <UiInput
            id={`${id}-path`}
            aria-labelledby={`${id}-path-label`}
            aria-describedby={`${id}-path-hint`}
            value={value.path}
            disabled={disabled}
            required
            maxLength={240}
            autoComplete="off"
            spellCheck={false}
            placeholder="product.id"
            onChange={(event) =>
              onChange({ ...value, path: event.target.value })
            }
          />
          <small className={styles.muted} id={`${id}-path-hint`}>
            Путь в{" "}
            {value.source === "input"
              ? "данных процесса"
              : "результате выбранного шага"}
            , до 240 символов.
          </small>
        </label>
      </>
    )}
  </section>
);
