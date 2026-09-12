/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerSystem.component.tsx
 * @version 1.0.0
 * @date 2026-09-10
 * @description Показывает фактическую системную основу и разрешённые возможности без редактирования.
 */

import { LockKeyhole } from "lucide-react";
import { UiBadge } from "@realize/ui-kit";
import type { AgentLayerSystemProps } from "./AgentLayerPanels.types";
import styles from "./AgentLayerSettings.module.css";

export const AgentLayerSystem = ({ system }: AgentLayerSystemProps) => (
  <div className={styles.overview}>
    <header className={styles.sectionHeading}>
      <div>
        <h2>Системная основа</h2>
        <p>Возможности и проверки, доступные конфигурации установки.</p>
      </div>
      <UiBadge>
        <LockKeyhole size={13} aria-hidden="true" /> Только чтение
      </UiBadge>
    </header>
    <dl className={styles.systemMetadata}>
      <div>
        <dt>Версия</dt>
        <dd>{system.version}</dd>
      </div>
      <div>
        <dt>Профиль проекта</dt>
        <dd>{system.projectProfile}</dd>
      </div>
      <div>
        <dt>Системный выпуск</dt>
        <dd className={styles.identifier}>{system.releaseID}</dd>
      </div>
    </dl>
    <section className={styles.overviewSection}>
      <div className={styles.sectionHeading}>
        <h3>Возможности</h3>
        <UiBadge>{system.capabilities.length}</UiBadge>
      </div>
      {system.capabilities.map((capability) => (
        <details
          className={styles.systemCapability}
          key={`${capability.id}:${capability.version}`}
        >
          <summary>
            <span>
              <strong>{capability.title}</strong>
              <small>{capability.description}</small>
            </span>
            <UiBadge>{capability.version}</UiBadge>
          </summary>
          <dl className={styles.details}>
            <div>
              <dt>Идентификатор</dt>
              <dd className={styles.identifier}>{capability.id}</dd>
            </div>
            <div>
              <dt>Действия</dt>
              <dd>{capability.actions.join(", ")}</dd>
            </div>
            <div>
              <dt>Область чтения</dt>
              <dd>{capability.scopes.read.join(", ") || "Не задана"}</dd>
            </div>
            <div>
              <dt>Область изменения</dt>
              <dd>{capability.scopes.write.join(", ") || "Не задана"}</dd>
            </div>
            <div>
              <dt>Максимум объектов</dt>
              <dd>{capability.limits.maxTargets}</dd>
            </div>
            <div>
              <dt>Обязательные проверки</dt>
              <dd>{capability.requiredCheckIDs.join(", ") || "Нет"}</dd>
            </div>
          </dl>
        </details>
      ))}
      {!system.capabilities.length && (
        <p className={styles.muted}>
          Системные возможности не зарегистрированы.
        </p>
      )}
    </section>
    <section className={styles.overviewSection}>
      <div className={styles.sectionHeading}>
        <h3>Проверки</h3>
        <UiBadge>{system.checkIDs.length}</UiBadge>
      </div>
      <ul className={styles.systemChecks}>
        {system.checkIDs.map((id) => (
          <li key={id}>
            <code>{id}</code>
          </li>
        ))}
      </ul>
      {!system.checkIDs.length && (
        <p className={styles.muted}>Системные проверки не зарегистрированы.</p>
      )}
    </section>
  </div>
);
