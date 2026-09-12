/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/AgentLayerOverview.component.tsx
 * @version 1.1.1
 * @date 2026-09-10
 * @description Показывает состав черновика и записи, связи которых требуют внимания.
 */

import {
  ArrowUpRight,
  Layers,
  Link2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { UiBadge, UiButton, UiSurface } from "@realize/ui-kit";
import type { AgentLayerOverviewProps } from "./AgentLayerPanels.types";
import { buildAgentLayerArtifactRelationIndex } from "./getAgentLayerArtifactRelations.util";
import { AGENT_LAYER_NAVIGATION } from "./agentLayerSections.config";
import { AGENT_LAYER_STATE_LABELS } from "./agentLayerPresentation.util";
import styles from "./AgentLayerSettings.module.css";

export const AgentLayerOverview = ({
  bootstrap,
  draft,
  isBusy,
  onSection,
  onOpen,
}: AgentLayerOverviewProps) => {
  const artifacts = draft?.artifacts ?? [];
  const activeRelease = bootstrap.releases.find(
    (item) =>
      item.id === bootstrap.activePointer?.releaseID &&
      item.manifestHash === bootstrap.activePointer.manifestHash,
  );
  const relationIndex = buildAgentLayerArtifactRelationIndex(artifacts);
  const relationships = artifacts.map((artifact) => ({
    artifact,
    relations: relationIndex.get(`${artifact.kind}:${artifact.key}`)!,
  }));
  const issues = relationships.filter(({ artifact, relations }) =>
    relations.outgoing.some(
      ({ artifact: target }) =>
        !target || (artifact.enabled && !target.enabled),
    ),
  );
  const metrics = [
    { label: "Записей", value: artifacts.length, icon: Layers },
    {
      label: "Профилей агентов",
      value: artifacts.filter((item) => item.kind === "agent_profile").length,
      icon: UsersRound,
    },
    {
      label: "Связей между записями",
      value: relationships.reduce(
        (count, item) => count + item.relations.outgoing.length,
        0,
      ),
      icon: Link2,
    },
    {
      label: "Включено",
      value: artifacts.filter((item) => item.enabled).length,
      icon: ShieldCheck,
    },
  ];
  return (
    <div className={styles.overview}>
      <header className={styles.sectionHeading}>
        <div>
          <h2>Обзор</h2>
          <p>Состав и состояние выбранного черновика.</p>
        </div>
        <UiButton
          variant="secondary"
          onClick={() => onSection("all")}
          disabled={isBusy}
        >
          Открыть каталог <ArrowUpRight size={16} aria-hidden="true" />
        </UiButton>
      </header>
      <div className={styles.metrics}>
        {metrics.map(({ label, value, icon: Icon }) => (
          <UiSurface key={label} appearance="flush" className={styles.metric}>
            <Icon size={18} aria-hidden="true" />
            <strong>{value}</strong>
            <span>{label}</span>
          </UiSurface>
        ))}
      </div>
      <div className={styles.overviewColumns}>
        <section className={styles.overviewSection}>
          <h3>Состав конфигурации</h3>
          <div className={styles.composition}>
            {AGENT_LAYER_NAVIGATION.flatMap((group) => group.items)
              .filter(
                (item) =>
                  !["overview", "all", "versions", "system"].includes(item.id),
              )
              .map(({ id, label, icon: Icon }) => (
                <UiButton
                  key={id}
                  variant="ghost"
                  className={styles.compositionItem}
                  disabled={isBusy}
                  onClick={() => onSection(id)}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{label}</span>
                  <UiBadge>
                    {artifacts.filter((item) => item.kind === id).length}
                  </UiBadge>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </UiButton>
              ))}
          </div>
        </section>
        <div className={styles.overviewSide}>
          <section className={styles.overviewSection}>
            <div className={styles.sectionHeading}>
              <h3>Связи</h3>
              <UiBadge tone={issues.length ? "danger" : "positive"}>
                {issues.length
                  ? `${issues.length} требуют внимания`
                  : "Без разрывов"}
              </UiBadge>
            </div>
            <p className={styles.muted}>
              {issues.length
                ? "Проверьте отсутствующие и выключенные записи, на которые ссылается конфигурация."
                : "Ссылки между записями согласованы. Полную проверку конфигурации можно запустить в верхней панели."}
            </p>
            {issues.slice(0, 5).map(({ artifact }) => (
              <UiButton
                key={`${artifact.kind}:${artifact.key}`}
                variant="ghost"
                className={styles.issueLink}
                disabled={isBusy}
                onClick={() => onOpen(artifact)}
              >
                {artifact.title || artifact.key}
                <ArrowUpRight size={14} aria-hidden="true" />
              </UiButton>
            ))}
            {issues.length > 5 && (
              <p className={styles.muted}>
                Ещё {issues.length - 5} записей. Откройте каталог и проверьте
                связи.
              </p>
            )}
          </section>
          <section className={styles.overviewSection}>
            <h3>Конфигурация установки</h3>
            <dl className={styles.details}>
              <div>
                <dt>Черновик</dt>
                <dd>
                  {draft ? AGENT_LAYER_STATE_LABELS[draft.state] : "Не выбран"}
                </dd>
              </div>
              <div>
                <dt>Редакция</dt>
                <dd>{draft?.revision ?? "—"}</dd>
              </div>
              <div>
                <dt>Системная версия</dt>
                <dd>{bootstrap.system.version}</dd>
              </div>
              <div>
                <dt>Активный выпуск</dt>
                <dd>
                  {bootstrap.activePointer
                    ? activeRelease
                      ? `Выпуск ${activeRelease.version}`
                      : bootstrap.activePointer.releaseID
                    : "Не выбран"}
                </dd>
              </div>
            </dl>
            <div className={styles.inline}>
              <UiButton
                size="small"
                variant="ghost"
                onClick={() => onSection("versions")}
              >
                Версии
              </UiButton>
              <UiButton
                size="small"
                variant="ghost"
                onClick={() => onSection("system")}
              >
                Системная основа
              </UiButton>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
