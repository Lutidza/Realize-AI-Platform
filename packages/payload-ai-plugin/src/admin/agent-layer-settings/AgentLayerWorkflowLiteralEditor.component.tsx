/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflowLiteralEditor.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Отображает поля скалярного литерала и локальный JSON-ввод объекта или массива.
 */

import { UiInput, UiSelect, UiTextarea } from "@realize/ui-kit";
import type { AgentLayerWorkflowLiteralEditorProps } from "./AgentLayerWorkflowEditor.types";
import { AGENT_LAYER_WORKFLOW_LITERAL_LABELS } from "./agentLayerWorkflowPresentation.config";
import { createAgentLayerWorkflowLiteralInput } from "./createAgentLayerWorkflowLiteralInput.util";
import formStyles from "./AgentLayerProfileEditor.module.css";
import textStyles from "./AgentLayerInstructionEditor.module.css";

/** Незавершённые числа и JSON остаются строками общей формы до проверки при сохранении. */
export const AgentLayerWorkflowLiteralEditor = ({
  id,
  value,
  disabled,
  onChange,
}: AgentLayerWorkflowLiteralEditorProps) => (
  <div className={formStyles.section}>
    <label className={formStyles.field} htmlFor={`${id}-literal-type`}>
      <span>Тип значения</span>
      <UiSelect
        id={`${id}-literal-type`}
        value={value.type}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            createAgentLayerWorkflowLiteralInput(
              event.target.value as typeof value.type,
            ),
          )
        }
      >
        {Object.entries(AGENT_LAYER_WORKFLOW_LITERAL_LABELS).map(
          ([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ),
        )}
      </UiSelect>
    </label>
    {value.type === "string" ? (
      <label className={formStyles.field} htmlFor={`${id}-literal-string`}>
        <span>Текст значения</span>
        <UiTextarea
          id={`${id}-literal-string`}
          className={formStyles.description}
          value={value.value}
          maxLength={32000}
          disabled={disabled}
          rows={4}
          onChange={(event) =>
            onChange({ ...value, value: event.target.value })
          }
        />
      </label>
    ) : value.type === "number" ? (
      <label className={formStyles.field} htmlFor={`${id}-literal-number`}>
        <span id={`${id}-literal-number-label`}>Числовое значение</span>
        <UiInput
          id={`${id}-literal-number`}
          aria-labelledby={`${id}-literal-number-label`}
          aria-describedby={`${id}-literal-number-hint`}
          type="text"
          inputMode="decimal"
          value={value.valueText}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) =>
            onChange({ ...value, valueText: event.target.value })
          }
        />
        <small className={formStyles.muted} id={`${id}-literal-number-hint`}>
          Конечное число. Для дробной части используйте точку.
        </small>
      </label>
    ) : value.type === "boolean" ? (
      <label className={formStyles.field} htmlFor={`${id}-literal-boolean`}>
        <span>Логическое значение</span>
        <UiSelect
          id={`${id}-literal-boolean`}
          value={String(value.value)}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, value: event.target.value === "true" })
          }
        >
          <option value="true">Да</option>
          <option value="false">Нет</option>
        </UiSelect>
      </label>
    ) : value.type === "null" ? (
      <p className={formStyles.muted}>Передаётся пустое значение null.</p>
    ) : (
      <label className={formStyles.field} htmlFor={`${id}-literal-json`}>
        <span id={`${id}-literal-json-label`}>
          {value.type === "array"
            ? "Массив значений (JSON)"
            : "Объект значений (JSON)"}
        </span>
        <UiTextarea
          id={`${id}-literal-json`}
          aria-labelledby={`${id}-literal-json-label`}
          className={`${textStyles.lineList} ${textStyles.template}`}
          value={value.valueText}
          disabled={disabled}
          rows={8}
          spellCheck={false}
          onChange={(event) =>
            onChange({ ...value, valueText: event.target.value })
          }
          aria-describedby={`${id}-literal-json-hint`}
        />
        <small className={formStyles.muted} id={`${id}-literal-json-hint`}>
          JSON только для этого значения. В массиве — до 256 элементов, в
          объекте — до 128 полей; вложенность — до 12 уровней. Состав и формат
          проверяются при сохранении.
        </small>
      </label>
    )}
  </div>
);
