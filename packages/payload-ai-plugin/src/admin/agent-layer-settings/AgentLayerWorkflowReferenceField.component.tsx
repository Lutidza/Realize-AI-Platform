/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerWorkflowReferenceField.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Показывает одну явную ссылку процесса с выбором, диагностикой и переходом к цели.
 */

import { UiBadge, UiNotice } from "@realize/ui-kit";
import { ChevronDown } from "lucide-react";
import type { AgentLayerWorkflowReferenceFieldProps } from "./AgentLayerWorkflowEditor.types";
import { AgentLayerChoiceList } from "./AgentLayerChoiceList.component";
import { useAgentLayerChoiceList } from "./useAgentLayerChoiceList.hook";
import styles from "./AgentLayerProfileEditor.module.css";

/** Отсутствующая цель остаётся выбранной до явной замены. */
export const AgentLayerWorkflowReferenceField = ({
  label,
  description,
  options,
  value,
  disabled,
  navigationDisabled,
  onChange,
  onOpen,
}: AgentLayerWorkflowReferenceFieldProps) => {
  const selected = options.find((option) => option.key === value);
  const picker = useAgentLayerChoiceList({
    options,
    selectedKeys: value ? [value] : [],
    mode: "single",
    disabled,
    onChange: (keys) => {
      if (keys[0]) onChange(keys[0]);
    },
  });
  return (
    <details className={styles.referenceGroup}>
      <summary className={styles.groupSummary}>
        <ChevronDown size={17} aria-hidden="true" />
        <span className={styles.referenceLabel}>
          <strong>{label}</strong>
          <code>{selected?.title ?? (value || "Не выбрано")}</code>
        </span>
        <span className={styles.groupCounts}>
          {value && !selected ? (
            <UiBadge tone="danger">Не найдено</UiBadge>
          ) : selected?.inactive ? (
            <UiBadge tone={selected.inactiveIsProblem ? "danger" : "neutral"}>
              Выключено
            </UiBadge>
          ) : (
            <UiBadge>{value ? "Выбрано" : "Не выбрано"}</UiBadge>
          )}
        </span>
      </summary>
      <div className={styles.picker}>
        {description && <p className={styles.muted}>{description}</p>}
        {value && !selected && (
          <UiNotice tone="danger">
            Сохранённая ссылка ведёт на отсутствующую запись. Выберите
            подходящую цель; исходный ключ остаётся в форме до замены.
          </UiNotice>
        )}
        {selected?.inactive && (
          <UiNotice tone={selected.inactiveIsProblem ? "danger" : "neutral"}>
            Выбранная запись выключена. Проверьте её состояние перед выпуском
            процесса.
          </UiNotice>
        )}
        <AgentLayerChoiceList
          label={label}
          picker={picker}
          onOpen={onOpen}
          navigationDisabled={navigationDisabled}
        />
      </div>
    </details>
  );
};
