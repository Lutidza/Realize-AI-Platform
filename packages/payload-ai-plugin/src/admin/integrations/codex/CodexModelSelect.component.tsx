/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexModelSelect.component.tsx
 * @version 1.0.0
 * @date 2026-09-30
 * @description Показывает реальный каталог, сохраняя прежнее значение без придуманной модели.
 */
import { UiSelect } from "@realize/ui-kit";
import type { CodexModelSelectProps } from "./CodexModelSelect.types";

export const CodexModelSelect = ({
  models,
  value,
  disabled,
  emptyLabel,
  onChange,
}: CodexModelSelectProps) => (
  <UiSelect
    value={value}
    disabled={disabled || !models}
    onChange={(event) => onChange(event.target.value)}
  >
    <option value="">{emptyLabel}</option>
    {value && !models?.some((model) => model.model === value) ? (
      <option value={value}>{value} — сохранённая модель</option>
    ) : null}
    {models?.map((model) => (
      <option key={model.model} value={model.model}>
        {model.displayName}
      </option>
    ))}
  </UiSelect>
);
