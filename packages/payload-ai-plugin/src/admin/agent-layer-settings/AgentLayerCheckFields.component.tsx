/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerCheckFields.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Показывает выбор зарегистрированной проверки и связанные системные возможности.
 */

import { UiBadge, UiNotice } from "@realize/ui-kit";
import { ChevronDown } from "lucide-react";
import type { AgentLayerCheckFieldsProps } from "./AgentLayerBindingEditor.types";
import { AgentLayerChoiceList } from "./AgentLayerChoiceList.component";
import { useAgentLayerChoiceList } from "./useAgentLayerChoiceList.hook";
import styles from "./AgentLayerProfileEditor.module.css";
import detailStyles from "./AgentLayerSettings.module.css";

/** Метаданные строятся только из checkIDs и requiredCheckIDs опубликованной системной основы. */
export const AgentLayerCheckFields = ({
  id,
  fields,
  system,
  disabled,
  onChange,
}: AgentLayerCheckFieldsProps) => {
  const isRegistered = system.checkIDs.includes(fields.checkID);
  const requiredBy = system.capabilities.filter((item) =>
    item.requiredCheckIDs.includes(fields.checkID),
  );
  const picker = useAgentLayerChoiceList({
    options: system.checkIDs.map((key) => ({ key, title: key })),
    selectedKeys: fields.checkID ? [fields.checkID] : [],
    mode: "single",
    disabled,
    onChange: (keys) => {
      if (keys[0]) onChange({ ...fields, checkID: keys[0] });
    },
  });
  const requiredByPicker = useAgentLayerChoiceList({
    options: requiredBy.map((item) => ({
      key: JSON.stringify([item.id, item.version]),
      title: `${item.title} · ${item.version}`,
      code: item.id,
    })),
    selectedKeys: [],
    disabled: true,
    mode: "readOnly",
    onChange: () => undefined,
  });
  return (
    <section className={styles.section} aria-labelledby={`${id}-system-check`}>
      <div className={styles.sectionHeader}>
        <div>
          <h3 id={`${id}-system-check`}>Системная проверка</h3>
          <p className={styles.muted}>
            Выберите проверку, зарегистрированную в системной основе установки.
          </p>
        </div>
      </div>
      {fields.checkID && !isRegistered && (
        <UiNotice tone="danger" title="Системная проверка не найдена">
          Сохранённый идентификатор остаётся в форме. Выберите доступную
          проверку или сохраните запись выключенной для последующей настройки.
        </UiNotice>
      )}
      <AgentLayerChoiceList
        label="Системная проверка"
        picker={picker}
        emptyLabel="Системные проверки не зарегистрированы."
      />
      {isRegistered && (
        <dl className={detailStyles.details}>
          <div>
            <dt>Идентификатор</dt>
            <dd>{fields.checkID}</dd>
          </div>
        </dl>
      )}
      {isRegistered && (
        <details className={styles.referenceGroup}>
          <summary className={styles.groupSummary}>
            <ChevronDown size={17} aria-hidden="true" />
            <strong>Обязательна для возможностей</strong>
            <span className={styles.groupCounts}>
              <UiBadge>{requiredBy.length}</UiBadge>
            </span>
          </summary>
          <div className={styles.picker}>
            <AgentLayerChoiceList
              label="Обязательна для возможностей"
              picker={requiredByPicker}
              emptyLabel="В системной основе нет обязательных связей с возможностями."
            />
          </div>
        </details>
      )}
    </section>
  );
};
