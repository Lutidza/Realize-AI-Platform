/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunsTable.component.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Показывает серверную страницу запусков с доступными мобильными строками.
 */

import { Link } from "@payloadcms/ui";
import { UiBadge, UiButton } from "@realize/ui-kit";
import { ChevronLeft, ChevronRight, GitBranch } from "lucide-react";
import type { WorkflowRunsTableProps } from "./WorkflowRuns.types";
import { buildWorkflowRunsURL } from "./buildWorkflowRunsURL.util";
import {
  workflowDate,
  workflowStatusLabels,
  workflowStatusTone,
} from "./workflowRunsPresentation.config";
import styles from "./WorkflowRuns.module.css";

export const WorkflowRunsTable = ({
  data,
  runsURL,
  query,
  loading,
  onPage,
}: WorkflowRunsTableProps) => (
  <section
    className={styles.catalog}
    aria-label="Реестр запусков"
    aria-busy={loading}
  >
    <div className={styles.resultBar}>
      <p className={styles.muted} role="status">
        {loading ? "Обновляем запуски…" : `Найдено: ${data.totalItems}`}
      </p>
      <span className={styles.muted}>Время — UTC</span>
    </div>
    {data.items.length === 0 ? (
      <div className={styles.empty}>
        <GitBranch size={28} aria-hidden="true" />
        <h2>Запуски не найдены</h2>
        <p>
          Измените фильтры или запустите рабочий процесс в диалоге с
          ассистентом.
        </p>
      </div>
    ) : (
      <div className={styles.tableViewport}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Процесс</th>
              <th scope="col">Профиль</th>
              <th scope="col">Состояние</th>
              <th scope="col">Шаги</th>
              <th scope="col">Начало</th>
              <th scope="col">Обновление</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.rootRunID}>
                <td className={styles.recordCell}>
                  <Link
                    className={styles.recordLink}
                    href={buildWorkflowRunsURL(runsURL, query, item.rootRunID)}
                  >
                    <strong>
                      {item.latestRun.workflow?.title ||
                        item.latestRun.workflow?.key ||
                        "Рабочий процесс"}
                    </strong>
                    <span className={styles.identifier}>{item.rootRunID}</span>
                    <span className={styles.summary}>
                      {item.conversation.title}
                    </span>
                  </Link>
                </td>
                <td>
                  <span className={styles.mobileLabel}>Профиль</span>
                  <span>
                    {item.latestRun.agentConfiguration?.profileTitle ?? "—"}
                  </span>
                </td>
                <td>
                  <span className={styles.mobileLabel}>Состояние</span>
                  <UiBadge tone={workflowStatusTone(item.status)} dot>
                    {workflowStatusLabels[item.status]}
                  </UiBadge>
                  <span className={styles.summary}>
                    {item.latestRun.workflow?.stepKey}
                  </span>
                </td>
                <td>
                  <span className={styles.mobileLabel}>Выполнено шагов</span>
                  {item.latestRun.workflow?.completedSteps ?? 0}
                </td>
                <td>
                  <span className={styles.mobileLabel}>Начало, UTC</span>
                  <time dateTime={item.createdAt}>
                    {workflowDate(item.createdAt)}
                  </time>
                </td>
                <td>
                  <span className={styles.mobileLabel}>Обновление, UTC</span>
                  <time dateTime={item.updatedAt}>
                    {workflowDate(item.updatedAt)}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <nav className={styles.resultBar} aria-label="Страницы запусков">
      <span className={styles.muted}>По {data.pageSize} на странице</span>
      <div className={styles.inline}>
        <UiButton
          variant="secondary"
          size="small"
          disabled={loading || data.page <= 1}
          onClick={() => onPage(data.page - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Назад
        </UiButton>
        <span className={styles.pageNumber}>
          {data.page} / {Math.max(1, data.totalPages)}
        </span>
        <UiButton
          variant="secondary"
          size="small"
          disabled={loading || data.page >= data.totalPages}
          onClick={() => onPage(data.page + 1)}
        >
          Далее
          <ChevronRight size={16} aria-hidden="true" />
        </UiButton>
      </div>
    </nav>
  </section>
);
