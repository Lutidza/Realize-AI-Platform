/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunDetail.component.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Компонует состояние, исторические связи и вкладки полной карточки процесса.
 */

"use client";

import { useState } from "react";
import { Link } from "@payloadcms/ui";
import {
  UiBadge,
  UiButton,
  UiNotice,
  UiSurface,
  UiTabs,
  getUiButtonClassName,
} from "@realize/ui-kit";
import {
  ArrowLeft,
  ExternalLink,
  ListChecks,
  MessageSquare,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { WorkflowRunApprovals } from "./WorkflowRunApprovals.component";
import {
  buildAIConfigurationURL,
  buildAIConversationURL,
} from "../realizeAILinks.util";
import { useWorkflowRunDetail } from "./useWorkflowRunDetail.hook";
import { WorkflowRunActions } from "./WorkflowRunActions.component";
import { WorkflowRunTimeline } from "./WorkflowRunTimeline.component";
import { WorkflowRunResults } from "./WorkflowRunResults.component";
import {
  workflowDate,
  workflowStatusLabels,
  workflowStatusTone,
} from "./workflowRunsPresentation.config";
import type { WorkflowRunDetailProps } from "./WorkflowRuns.types";
import styles from "./WorkflowRuns.module.css";

export const WorkflowRunDetail = ({
  rootRunID,
  backURL,
  chatURL,
  settingsURL,
}: WorkflowRunDetailProps) => {
  const controller = useWorkflowRunDetail(rootRunID);
  const [tab, setTab] = useState("timeline");
  const { detail, latestRun, loading, error, navigationLocked } = controller;
  const links = (href: string, label: string) =>
    navigationLocked ? (
      <UiButton variant="ghost" size="small" disabled>
        {label}
        <ExternalLink size={13} aria-hidden="true" />
      </UiButton>
    ) : (
      <Link
        className={getUiButtonClassName({ variant: "ghost", size: "small" })}
        href={href}
      >
        {label}
        <ExternalLink size={13} aria-hidden="true" />
      </Link>
    );
  const back = navigationLocked ? (
    <UiButton variant="ghost" size="small" disabled>
      <ArrowLeft size={16} aria-hidden="true" />К реестру
    </UiButton>
  ) : (
    <Link
      className={getUiButtonClassName({ variant: "ghost", size: "small" })}
      href={backURL}
    >
      <ArrowLeft size={16} aria-hidden="true" />К реестру
    </Link>
  );
  if (!detail)
    return (
      <div className={styles.stack}>
        {back}
        {error ? (
          <UiNotice tone="danger" role="alert">
            {error}
            <UiButton
              variant="ghost"
              onClick={() => void controller.refresh().catch(() => {})}
            >
              Повторить загрузку
            </UiButton>
          </UiNotice>
        ) : (
          <p className={styles.empty} role="status">
            Загружаем запуск…
          </p>
        )}
      </div>
    );
  const { item } = detail;
  const configuration = item.latestRun.agentConfiguration;
  const workflow = item.latestRun.workflow;
  const issues = detail.segments.filter((segment) => segment.run.errorSummary);
  const reason = workflow?.reason;
  return (
    <div className={styles.stack} aria-busy={loading}>
      <div className={styles.resultBar}>
        {back}
        <span className={styles.identifier}>{rootRunID}</span>
      </div>
      <header className={styles.detailHeader}>
        <div>
          <h2>{workflow?.title || workflow?.key || "Рабочий процесс"}</h2>
          <p className={styles.muted}>{item.conversation.title}</p>
        </div>
        <UiBadge tone={workflowStatusTone(item.status)} dot>
          {workflowStatusLabels[item.status]}
        </UiBadge>
      </header>
      <div className={styles.links} aria-label="Связанные записи">
        {links(buildAIConversationURL(chatURL, item.conversation.id), "Диалог")}
        {configuration && detail.permissions.canManageConfiguration ? (
          <>
            {workflow
              ? links(
                  buildAIConfigurationURL(
                    settingsURL,
                    configuration.releaseID,
                    { kind: "workflow_definition", key: workflow.key },
                  ),
                  `Процесс · v${workflow.revision}`,
                )
              : null}
            {links(
              buildAIConfigurationURL(settingsURL, configuration.releaseID, {
                kind: "agent_profile",
                key: configuration.profileKey,
              }),
              configuration.profileTitle,
            )}
            {links(
              buildAIConfigurationURL(settingsURL, configuration.releaseID),
              `Выпуск v${configuration.releaseVersion}`,
            )}
          </>
        ) : configuration ? (
          <span className={styles.muted}>
            {configuration.profileTitle} · выпуск v
            {configuration.releaseVersion}
          </span>
        ) : null}
      </div>
      <dl className={styles.metadata}>
        <div>
          <dt>Начало, UTC</dt>
          <dd>{workflowDate(item.createdAt)}</dd>
        </div>
        <div>
          <dt>Обновление, UTC</dt>
          <dd>{workflowDate(item.updatedAt)}</dd>
        </div>
        <div>
          <dt>Выполнено шагов</dt>
          <dd>
            {workflow?.completedSteps ?? 0} · сегментов: {item.segmentCount}
          </dd>
        </div>
        <div>
          <dt>Текущий шаг</dt>
          <dd>{workflow?.stepKey ?? "—"}</dd>
        </div>
      </dl>
      {navigationLocked ? (
        <UiNotice role="status">
          {controller.isLocked
            ? "Дождитесь подтверждения запроса или повторите его. Переходы временно недоступны."
            : "В карточке есть неотправленные изменения. Отправьте или очистите их перед переходом."}
        </UiNotice>
      ) : null}
      {error ? (
        <UiNotice tone="danger" role="alert">
          {error}
        </UiNotice>
      ) : null}
      <WorkflowRunActions controller={controller} />
      {latestRun?.status === "queued" || latestRun?.status === "running" ? (
        <UiSurface
          className={styles.actionPanel}
          aria-label="Текущий ответ агента"
        >
          <div className={styles.resultBar}>
            <strong>
              {latestRun.status === "queued"
                ? "Шаг ожидает запуска"
                : "Агент выполняет шаг"}
            </strong>
            <span className={styles.muted}>
              {controller.stream.elapsedSeconds} с
            </span>
          </div>
          {controller.stream.toolSummary ? (
            <p className={styles.muted}>{controller.stream.toolSummary}</p>
          ) : null}
          {controller.stream.streamingMessage ? (
            <div className={styles.text}>
              {controller.stream.streamingMessage}
            </div>
          ) : null}
          {controller.stream.issue ? (
            <UiNotice>
              {controller.stream.issue}
              <UiButton
                variant="ghost"
                size="small"
                onClick={controller.stream.retry}
              >
                Восстановить соединение
              </UiButton>
            </UiNotice>
          ) : null}
        </UiSurface>
      ) : null}
      <UiSurface className={styles.tabsSurface}>
        <UiTabs
          label="Информация о запуске"
          value={tab}
          onValueChange={setTab}
          items={[
            {
              id: "timeline",
              label: "Ход выполнения",
              icon: <ListChecks size={15} />,
              content: <WorkflowRunTimeline detail={detail} />,
            },
            {
              id: "results",
              label: "Результаты",
              icon: <MessageSquare size={15} />,
              content: <WorkflowRunResults detail={detail} />,
            },
            {
              id: "issues",
              label: `Проблемы${issues.length || reason ? ` (${issues.length + (reason ? 1 : 0)})` : ""}`,
              icon: <TriangleAlert size={15} />,
              content: (
                <div className={styles.stack}>
                  {reason ? (
                    <UiNotice
                      tone={item.status === "blocked" ? "danger" : "neutral"}
                    >
                      {reason}
                    </UiNotice>
                  ) : null}
                  {issues.map((segment) => (
                    <UiNotice
                      key={segment.run.id}
                      tone="danger"
                      title={`Сегмент ${segment.run.id}`}
                    >
                      {segment.run.errorSummary}
                    </UiNotice>
                  ))}
                  {!reason && !issues.length ? (
                    <p className={styles.empty}>Сохранённых проблем нет.</p>
                  ) : null}
                </div>
              ),
            },
            {
              id: "approvals",
              label: `Подтверждения${detail.dataOperations.length ? ` (${detail.dataOperations.length})` : ""}`,
              icon: <ShieldCheck size={15} />,
              content: <WorkflowRunApprovals controller={controller} />,
            },
          ]}
        />
      </UiSurface>
    </div>
  );
};
