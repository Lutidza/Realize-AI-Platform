/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerReleaseInspector.component.tsx
 * @version 1.1.0
 * @date 2026-09-11
 * @description Даёт просмотреть точный состав выпуска перед применением к новым запускам чата.
 */
"use client";
import { ArrowLeft, CheckCircle2, RotateCcw } from "lucide-react";
import { UiBadge, UiButton, UiNotice } from "@realize/ui-kit";
import type { AgentLayerReleaseInspectorProps } from "./AgentLayerRelease.types";
import { useAgentLayerReleaseInspector } from "./useAgentLayerReleaseInspector.hook";
import { AgentLayerCatalog } from "./AgentLayerCatalog.component";
import { AgentLayerArtifactDetails } from "./AgentLayerArtifactDetails.component";
import { formatAgentLayerDate } from "./agentLayerPresentation.util";
import styles from "./AgentLayerSettings.module.css";

export const AgentLayerReleaseInspector = ({
  release,
  initialArtifact,
  bootstrap,
  disabled,
  onBack,
  onActivate,
}: AgentLayerReleaseInspectorProps) => {
  const { contentRef, ...view } = useAgentLayerReleaseInspector(
    release,
    initialArtifact,
  );
  const active = bootstrap.activePointer;
  const activeRelease = bootstrap.releases.find(
    (item) =>
      item.id === active?.releaseID &&
      item.manifestHash === active.manifestHash,
  );
  const isActive =
    active?.releaseID === release.id &&
    active.manifestHash === release.manifestHash;
  const rollback = Boolean(
    activeRelease && release.version < activeRelease.version,
  );
  return (
    <div className={styles.overview}>
      <header className={styles.recordHeader}>
        <UiButton
          variant="ghost"
          size="small"
          disabled={disabled}
          onClick={onBack}
        >
          <ArrowLeft size={16} />К версиям
        </UiButton>
        <span className={styles.recordPath}>Выпуск конфигурации</span>
        <div className={styles.recordTitle}>
          <h2>Выпуск {release.version}</h2>
          <UiBadge tone={isActive ? "positive" : "neutral"}>
            {isActive ? "Активен" : "Сохранён"}
          </UiBadge>
        </div>
        <p className={styles.muted}>
          {formatAgentLayerDate(release.createdAt)} · {release.artifacts.length}{" "}
          записей · только просмотр
        </p>
      </header>
      <section
        className={styles.overviewSection}
        aria-label="Применение выпуска"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h3>
              {isActive
                ? "Конфигурация для новых запусков"
                : "Применить к новым запускам"}
            </h3>
            <p>
              Инструкции профиля, ролей, правил, навыков и шаблонов агента
              применяются к новым ответам чата. Текущие запуски сохраняют свою
              конфигурацию.
            </p>
          </div>
        </div>
        <p className={styles.muted}>
          Рабочий процесс выбирается явно в чате. Начатый процесс сохраняет свой
          выпуск при продолжении.
        </p>
        <dl className={styles.details}>
          <div>
            <dt>Сейчас активно</dt>
            <dd>
              {active
                ? activeRelease
                  ? `Выпуск ${activeRelease.version}`
                  : active.releaseID
                : "Системная конфигурация"}
            </dd>
          </div>
          <div>
            <dt>Выбранный выпуск</dt>
            <dd>Выпуск {release.version}</dd>
          </div>
        </dl>
        {isActive ? (
          <UiNotice tone="positive" role="status">
            Выпуск активен. Выберите его профиль в чате перед следующим
            сообщением.
          </UiNotice>
        ) : (
          <div className={styles.inline}>
            <UiButton
              disabled={disabled}
              onClick={() => onActivate(rollback ? "rollback" : "activate")}
            >
              {rollback ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
              {rollback
                ? `Вернуться к выпуску ${release.version}`
                : `Активировать выпуск ${release.version}`}
            </UiButton>
          </div>
        )}
        <details className={styles.systemCapability}>
          <summary>
            <span>
              <strong>Сведения о выпуске</strong>
              <small>
                Исходный черновик, совместимость и контрольная сумма
              </small>
            </span>
          </summary>
          <dl className={styles.details}>
            <div>
              <dt>Идентификатор</dt>
              <dd>{release.id}</dd>
            </div>
            <div>
              <dt>Исходный черновик</dt>
              <dd>
                {release.sourceDraftID} · редакция {release.sourceDraftRevision}
              </dd>
            </div>
            <div>
              <dt>Создал</dt>
              <dd>{release.createdBy}</dd>
            </div>
            <div>
              <dt>Системная версия</dt>
              <dd>
                {release.systemCompatibility.minimumRelease}
                {release.systemCompatibility.maximumRelease
                  ? ` — ${release.systemCompatibility.maximumRelease}`
                  : " и выше"}
              </dd>
            </div>
            <div>
              <dt>Контрольная сумма</dt>
              <dd>
                <code className={styles.identifier}>
                  {release.manifestHash}
                </code>
              </dd>
            </div>
          </dl>
        </details>
      </section>
      <div ref={contentRef}>
        {view.missingTarget && (
          <UiNotice tone="danger" role="alert">
            Запись из ссылки отсутствует в этом выпуске. Показан точный состав
            указанного выпуска.
          </UiNotice>
        )}
        {view.selected ? (
          <div className={styles.record}>
            <header className={styles.recordHeader}>
              <UiButton
                variant="ghost"
                size="small"
                onClick={view.back}
                disabled={disabled}
              >
                <ArrowLeft size={16} />К составу выпуска
              </UiButton>
              <div className={styles.recordTitle}>
                <h2>{view.selected.title || view.selected.key}</h2>
                <UiBadge>Просмотр</UiBadge>
              </div>
              <code className={styles.recordKey}>{view.selected.key}</code>
            </header>
            <AgentLayerArtifactDetails
              artifact={view.selected}
              artifacts={view.artifacts}
              system={bootstrap.system}
              onSelect={view.select}
              disabled={disabled}
            />
          </div>
        ) : (
          <AgentLayerCatalog
            artifacts={view.artifacts}
            state={view.catalog}
            onStateChange={view.setCatalog}
            onOpen={view.select}
            disabled={disabled}
            title="Состав выпуска"
            description="Неизменяемые записи и связи этого выпуска. Системные ссылки сверяются с текущей системной основой."
          />
        )}
      </div>
    </div>
  );
};
