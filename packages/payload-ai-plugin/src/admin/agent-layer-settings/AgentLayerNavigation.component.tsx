/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerNavigation.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Показывает сгруппированные разделы со счётчиками и мобильным выбором раздела.
 */

import { UiButton, UiSelect } from "@realize/ui-kit";
import type {
  AgentLayerNavigationProps,
  AgentLayerSection,
} from "./AgentLayerWorkspace.types";
import { AGENT_LAYER_NAVIGATION } from "./agentLayerSections.config";
import styles from "./AgentLayerSettings.module.css";

export const AgentLayerNavigation = ({
  section,
  artifacts,
  disabled,
  onSelect,
}: AgentLayerNavigationProps) => (
  <>
    <nav className={styles.navigation} aria-label="Разделы агентского слоя">
      {AGENT_LAYER_NAVIGATION.map((group) => (
        <div className={styles.navigationGroup} key={group.label}>
          <p>{group.label}</p>
          {group.items.map(({ id, label, icon: Icon }) => {
            const count =
              id === "all"
                ? artifacts.length
                : artifacts.filter((artifact) => artifact.kind === id).length;
            const showCount = !["overview", "system", "versions"].includes(id);
            return (
              <UiButton
                key={id}
                variant="ghost"
                className={styles.navigationItem}
                aria-current={section === id ? "page" : undefined}
                disabled={disabled}
                onClick={() => onSelect(id)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
                {showCount && (
                  <span
                    className={styles.navigationCount}
                    aria-label={`${count} записей`}
                  >
                    {count}
                  </span>
                )}
              </UiButton>
            );
          })}
        </div>
      ))}
    </nav>
    <label className={styles.mobileNavigation}>
      <span>Раздел агентского слоя</span>
      <UiSelect
        value={section}
        disabled={disabled}
        onChange={(event) => onSelect(event.target.value as AgentLayerSection)}
      >
        {AGENT_LAYER_NAVIGATION.map((group) => (
          <optgroup label={group.label} key={group.label}>
            {group.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </optgroup>
        ))}
      </UiSelect>
    </label>
  </>
);
