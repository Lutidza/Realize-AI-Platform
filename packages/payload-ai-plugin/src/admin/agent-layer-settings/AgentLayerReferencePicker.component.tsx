/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerReferencePicker.component.tsx
 * @version 1.0.2
 * @date 2026-09-10
 * @description Показывает сворачиваемую группу связей с поиском, выбором и переходами к записям.
 */

import { UiBadge, UiNotice } from "@realize/ui-kit";
import { ChevronDown } from "lucide-react";
import { AgentLayerChoiceList } from "./AgentLayerChoiceList.component";
import type { AgentLayerReferencePickerProps } from "./AgentLayerReferencePicker.types";
import { useAgentLayerReferencePicker } from "./useAgentLayerReferencePicker.hook";
import styles from "./AgentLayerProfileEditor.module.css";

/** Группа остаётся смонтированной при закрытии, сохраняя поиск и страницу выбора. */
export const AgentLayerReferencePicker = (
  props: AgentLayerReferencePickerProps,
) => {
  const {
    accordionName,
    label,
    description,
    sourceEnabled,
    navigationDisabled,
    onOpen,
    children,
  } = props;
  const picker = useAgentLayerReferencePicker(props);
  const problemCount =
    picker.problemCount + (props.additionalProblemCount ?? 0);
  return (
    <details name={accordionName} className={styles.referenceGroup}>
      <summary className={styles.groupSummary}>
        <ChevronDown size={17} aria-hidden="true" />
        <strong>{label}</strong>
        <span className={styles.groupCounts}>
          <UiBadge>Выбрано: {picker.selectedCount}</UiBadge>
          {problemCount > 0 && (
            <UiBadge tone="danger">Проблемы: {problemCount}</UiBadge>
          )}
        </span>
      </summary>
      <div className={styles.picker}>
        <p className={styles.muted}>{description}</p>
        {(picker.missingCount > 0 ||
          (sourceEnabled && picker.disabledCount > 0)) && (
          <UiNotice tone="danger" title="Связи требуют проверки">
            {picker.missingCount > 0 && (
              <p className={styles.noticeText}>
                Не найдено записей: {picker.missingCount}. Удалите отсутствующие
                ссылки или восстановите записи в черновике.
              </p>
            )}
            {sourceEnabled && picker.disabledCount > 0 && (
              <p className={styles.noticeText}>
                Выключенных записей: {picker.disabledCount}. Включённая запись с
                такими ссылками не пройдёт проверку черновика.
              </p>
            )}
          </UiNotice>
        )}
        {children}
        <AgentLayerChoiceList
          label={label}
          picker={picker}
          navigationDisabled={navigationDisabled}
          emptyLabel="В черновике пока нет записей этого вида."
          onOpen={(key) => {
            const artifact = props.artifacts.find(
              (item) => item.kind === props.kind && item.key === key,
            );
            if (artifact) onOpen(artifact);
          }}
        />
      </div>
    </details>
  );
};
