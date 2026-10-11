/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageGroupSelect.component.tsx
 * @version 1.0.0
 * @date 2026-10-06
 * @description Позволяет выбрать известную группу, сохраняя активное значение при обновлении данных.
 */
import { UiSelect } from "@realize/ui-kit";
import type { UsageGrouping } from "./UsageAnalytics.types";
import { usageGroupLabel } from "./usageAnalyticsPresentation.util";

export function UsageGroupSelect({
  label,
  allLabel,
  value,
  options,
  group,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: string[];
  group: UsageGrouping;
  onChange: (value: string) => void;
}) {
  const values = [...new Set([...options, ...(value ? [value] : [])])];
  return (
    <label>
      {label}
      <UiSelect
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{allLabel}</option>
        {values.map((key) => (
          <option key={key} value={key}>
            {usageGroupLabel(key, group)}
          </option>
        ))}
      </UiSelect>
    </label>
  );
}
