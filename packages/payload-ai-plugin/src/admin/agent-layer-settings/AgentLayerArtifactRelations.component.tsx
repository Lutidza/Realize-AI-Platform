/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerArtifactRelations.component.tsx
 * @version 1.1.2
 * @date 2026-09-10
 * @description Показывает ограниченные по высоте списки связей с поиском и защищёнными переходами.
 */

import { UiBadge, UiButton, UiInput } from "@realize/ui-kit";
import { ArrowUpRight } from "lucide-react";
import type { AgentLayerArtifactRelationsProps } from "./AgentLayerArtifact.types";
import { AGENT_LAYER_KIND_LABELS } from "./agentLayerPresentation.util";
import { useAgentLayerArtifactRelations } from "./useAgentLayerArtifactRelations.hook";
import styles from "./AgentLayerArtifactDetails.module.css";

/** Поиск не удаляет отсутствующие ссылки и не изменяет полномочия переходов. */
export const AgentLayerArtifactRelations = (
  props: AgentLayerArtifactRelationsProps,
) => {
  const { artifact, system, onSelect, disabled, incomingOnly } = props;
  const search = useAgentLayerArtifactRelations(props);
  const { relations, systemCapability } = search;
  return (
    <aside
      className={
        incomingOnly ? `${styles.relations} ${styles.usage}` : styles.relations
      }
      aria-label={incomingOnly ? "Использование записи" : "Связи записи"}
    >
      {search.showSearch && (
        <div className={styles.relationSection}>
          <UiInput
            type="search"
            aria-label="Поиск по связям"
            placeholder="Название, ключ или тип"
            value={search.query}
            onChange={(event) => search.setQuery(event.target.value)}
            disabled={disabled}
          />
          <p className={styles.muted} role="status" aria-atomic="true">
            {search.hasQuery
              ? `Найдено: ${search.filteredCount} из ${search.totalCount}`
              : `Всего связей: ${search.totalCount}`}
          </p>
          {search.hasQuery && (
            <UiButton
              variant="ghost"
              size="small"
              onClick={() => search.setQuery("")}
              disabled={disabled}
            >
              Сбросить поиск
            </UiButton>
          )}
        </div>
      )}

      {!incomingOnly && (
        <section className={styles.relationSection}>
          <h3>
            Использует <UiBadge>{relations.outgoing.length}</UiBadge>
          </h3>
          {relations.outgoing.length ? (
            <ul className={styles.relationList}>
              {relations.outgoing.map(({ reference, artifact: target }) => (
                <li key={`${reference.kind}:${reference.key}`}>
                  {target ? (
                    <UiButton
                      variant="ghost"
                      disabled={disabled}
                      className={styles.relationButton}
                      onClick={() => onSelect(target)}
                    >
                      <span className={styles.relationLabel}>
                        <strong>{target.title}</strong>
                        <span className={styles.muted}>
                          {AGENT_LAYER_KIND_LABELS[target.kind]} · {target.key}
                        </span>
                        {!target.enabled && (
                          <UiBadge
                            tone={artifact.enabled ? "danger" : "neutral"}
                          >
                            Выключено
                          </UiBadge>
                        )}
                        {artifact.kind === "agent_profile" &&
                          reference.kind === "workflow_definition" &&
                          reference.key === artifact.defaultWorkflowKey && (
                            <UiBadge>По умолчанию</UiBadge>
                          )}
                      </span>
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </UiButton>
                  ) : (
                    <div className={styles.missingReference}>
                      <strong>{reference.key}</strong>
                      <span className={styles.muted}>
                        {AGENT_LAYER_KIND_LABELS[reference.kind]}
                      </span>
                      <UiBadge tone="danger">Не найдено</UiBadge>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>
              {search.hasQuery
                ? "По этому запросу исходящих связей нет."
                : "Нет ссылок на другие записи."}
            </p>
          )}
        </section>
      )}
      <section className={styles.relationSection}>
        <h3>
          Используется в <UiBadge>{relations.incoming.length}</UiBadge>
        </h3>
        {relations.incoming.length ? (
          <ul
            className={styles.relationList}
            tabIndex={0}
            aria-label="Записи, использующие эту запись"
          >
            {relations.incoming.map((source) => (
              <li key={`${source.kind}:${source.key}`}>
                <UiButton
                  variant="ghost"
                  disabled={disabled}
                  className={styles.relationButton}
                  onClick={() => onSelect(source)}
                >
                  <span className={styles.relationLabel}>
                    <strong>{source.title}</strong>
                    <span className={styles.muted}>
                      {AGENT_LAYER_KIND_LABELS[source.kind]} · {source.key}
                    </span>
                    {!source.enabled && <UiBadge>Выключено</UiBadge>}
                  </span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </UiButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>
            {search.hasQuery
              ? "По этому запросу входящих связей нет."
              : "На запись пока нет ссылок."}
          </p>
        )}
      </section>
      {!incomingOnly &&
        (artifact.kind === "capability_binding" ||
          artifact.kind === "check_binding") && (
          <section className={styles.relationSection}>
            <h3>Системная основа</h3>
            {artifact.kind === "capability_binding" ? (
              <div className={styles.systemReference}>
                <strong>
                  {systemCapability?.title ?? artifact.capability.id}
                </strong>
                <code>
                  {artifact.capability.id} · {artifact.capability.version}
                </code>
                <UiBadge tone={systemCapability ? "neutral" : "danger"}>
                  {systemCapability
                    ? "Системная возможность"
                    : "Точная версия не найдена"}
                </UiBadge>
                {systemCapability && (
                  <p className={styles.muted}>{systemCapability.description}</p>
                )}
              </div>
            ) : (
              <div className={styles.systemReference}>
                <code>{artifact.checkID}</code>
                <UiBadge
                  tone={
                    system.checkIDs.includes(artifact.checkID)
                      ? "neutral"
                      : "danger"
                  }
                >
                  {system.checkIDs.includes(artifact.checkID)
                    ? "Системная проверка"
                    : "Не найдена"}
                </UiBadge>
              </div>
            )}
          </section>
        )}
      <p className={styles.relationHint}>
        Связи показаны в выбранной версии конфигурации.
      </p>
    </aside>
  );
};
