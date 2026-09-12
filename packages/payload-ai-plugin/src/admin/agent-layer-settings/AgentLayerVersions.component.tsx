/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerVersions.component.tsx
 * @version 1.1.0
 * @date 2026-09-10
 * @description Отображает доступные версии с поиском, страницами и выбором рабочего черновика.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { UiBadge, UiButton, UiInput } from "@realize/ui-kit";
import type { AgentLayerVersionsProps } from "./AgentLayerVersions.types";
import { useAgentLayerVersions } from "./useAgentLayerVersions.hook";
import {
  AGENT_LAYER_STATE_LABELS,
  formatAgentLayerDate,
} from "./agentLayerPresentation.util";
import styles from "./AgentLayerSettings.module.css";

export const AgentLayerVersions = ({
  bootstrap,
  selectedDraftID,
  disabled,
  onSelectDraft,
  onOpenRelease,
  state,
  onStateChange,
}: AgentLayerVersionsProps) => {
  const versions = useAgentLayerVersions(bootstrap, state, onStateChange);
  return (
    <div className={styles.overview}>
      <header className={styles.sectionHeading}>
        <div>
          <h2>Версии</h2>
          <p>
            Черновики для редактирования и сохранённые выпуски конфигурации.
          </p>
        </div>
      </header>
      <div className={styles.versionToolbar}>
        <div className={styles.inline} role="group" aria-label="Вид версий">
          <UiButton
            variant="ghost"
            aria-pressed={versions.mode === "drafts"}
            onClick={() => versions.setMode("drafts")}
          >
            Черновики <UiBadge>{bootstrap.drafts.length}</UiBadge>
          </UiButton>
          <UiButton
            variant="ghost"
            aria-pressed={versions.mode === "releases"}
            onClick={() => versions.setMode("releases")}
          >
            Выпуски <UiBadge>{bootstrap.releases.length}</UiBadge>
          </UiButton>
        </div>
        <UiInput
          type="search"
          aria-label="Поиск версий"
          placeholder="Найти по идентификатору или редакции"
          value={versions.query}
          onChange={(event) => versions.setQuery(event.target.value)}
        />
      </div>
      <div className={styles.versionRows}>
        {versions.rows.map((item) => (
          <div className={styles.versionRow} key={item.id}>
            <div>
              <strong>
                {"state" in item
                  ? `Черновик · редакция ${item.revision}`
                  : `Выпуск ${item.version}`}
              </strong>
              <span className={styles.identifier}>{item.id}</span>
              <small>
                {item.artifactCount} записей ·{" "}
                {formatAgentLayerDate(
                  "updatedAt" in item ? item.updatedAt : item.createdAt,
                )}
              </small>
            </div>
            <div className={styles.inline}>
              {"state" in item ? (
                <>
                  <UiBadge>{AGENT_LAYER_STATE_LABELS[item.state]}</UiBadge>
                  <UiButton
                    size="small"
                    variant="secondary"
                    disabled={disabled || selectedDraftID === item.id}
                    onClick={() => onSelectDraft(item.id)}
                  >
                    {selectedDraftID === item.id ? "Текущий" : "Выбрать"}
                  </UiButton>
                </>
              ) : (
                <>
                  <UiBadge>
                    {bootstrap.activePointer?.releaseID === item.id
                      ? "Активен"
                      : "Сохранён"}
                  </UiBadge>
                  <UiButton
                    size="small"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => onOpenRelease(item.id)}
                  >
                    Открыть
                  </UiButton>
                </>
              )}
            </div>
          </div>
        ))}
        {!versions.rows.length && (
          <p className={styles.emptyText}>
            {versions.query
              ? "Версии по этому запросу не найдены."
              : versions.mode === "drafts"
                ? "Черновиков пока нет. Создайте первый в верхней панели."
                : "Сохранённых выпусков пока нет."}
          </p>
        )}
      </div>
      <footer className={styles.pagination}>
        <span>
          {versions.count} версий
          {versions.loadedCount === 100 ? " · показаны последние 100" : ""}
        </span>
        <div className={styles.inline}>
          <UiButton
            size="icon"
            variant="ghost"
            aria-label="Предыдущая страница версий"
            disabled={versions.page === 1}
            onClick={() => versions.setPage(versions.page - 1)}
          >
            <ChevronLeft size={16} />
          </UiButton>
          <span>
            {versions.page} / {versions.pageCount}
          </span>
          <UiButton
            size="icon"
            variant="ghost"
            aria-label="Следующая страница версий"
            disabled={versions.page === versions.pageCount}
            onClick={() => versions.setPage(versions.page + 1)}
          >
            <ChevronRight size={16} />
          </UiButton>
        </div>
      </footer>
    </div>
  );
};
