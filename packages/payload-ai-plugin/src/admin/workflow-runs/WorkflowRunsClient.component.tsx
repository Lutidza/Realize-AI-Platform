/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunsClient.component.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Связывает URL реестра с серверными страницами и карточкой запуска.
 */

"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation.js";
import { parseWorkflowRunListQuery } from "@realize/ai-contracts";
import { UiButton, UiNotice, UiSurface } from "@realize/ui-kit";
import { GitBranch, RefreshCw } from "lucide-react";
import { AdminUiTheme } from "../AdminUiTheme.component";
import type { WorkflowRunsViewData } from "./WorkflowRunsView.types";
import { WorkflowRunsFilters } from "./WorkflowRunsFilters.component";
import { WorkflowRunsTable } from "./WorkflowRunsTable.component";
import { WorkflowRunDetail } from "./WorkflowRunDetail.component";
import { useWorkflowRuns } from "./useWorkflowRuns.hook";
import {
  buildWorkflowRunsURL,
  workflowRunsSearch,
} from "./buildWorkflowRunsURL.util";
import styles from "./WorkflowRuns.module.css";

export const WorkflowRunsClient = (props: WorkflowRunsViewData) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const parsed = useMemo(() => {
    try {
      return {
        query: parseWorkflowRunListQuery(new URLSearchParams(rawQuery)),
        error: undefined,
      };
    } catch (cause) {
      return {
        query: undefined,
        error:
          cause instanceof Error
            ? cause.message
            : "Некорректные фильтры ссылки.",
      };
    }
  }, [rawQuery]);
  const search = parsed.query ? workflowRunsSearch(parsed.query) : undefined;
  const registry = useWorkflowRuns(props.rootRunID ? undefined : search);
  const query = parsed.query ?? { page: 1, pageSize: 25 };
  return (
    <AdminUiTheme>
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.titleRow}>
            <span className={styles.pageIcon}>
              <GitBranch size={23} aria-hidden="true" />
            </span>
            <div>
              <h1>
                {props.rootRunID ? "Запуск процесса" : "Запуски процессов"}
              </h1>
              <p>
                {props.rootRunID
                  ? "История шагов, результаты и подтверждения"
                  : "История выполнения, текущие шаги и процессы, которым нужен ваш ответ"}
              </p>
            </div>
          </div>
          {!props.rootRunID ? (
            <UiButton
              variant="secondary"
              disabled={registry.loading || Boolean(parsed.error)}
              onClick={registry.refresh}
            >
              <RefreshCw size={15} aria-hidden="true" />
              Обновить
            </UiButton>
          ) : null}
        </header>
        {parsed.error ? (
          <UiNotice tone="danger" role="alert">
            {parsed.error}
            <UiButton
              variant="ghost"
              onClick={() => router.replace(props.runsURL)}
            >
              Сбросить параметры
            </UiButton>
          </UiNotice>
        ) : props.rootRunID ? (
          <WorkflowRunDetail
            key={props.rootRunID}
            rootRunID={props.rootRunID}
            backURL={buildWorkflowRunsURL(props.runsURL, query)}
            chatURL={props.chatURL}
            settingsURL={props.settingsURL}
          />
        ) : (
          <UiSurface className={styles.registrySurface}>
            <WorkflowRunsFilters
              key={search}
              query={query}
              onApply={(next) =>
                router.push(buildWorkflowRunsURL(props.runsURL, next), {
                  scroll: false,
                })
              }
            />
            {registry.error ? (
              <UiNotice tone="danger" role="alert">
                {registry.error}
                <UiButton variant="ghost" onClick={registry.refresh}>
                  Повторить загрузку
                </UiButton>
              </UiNotice>
            ) : null}
            {registry.data ? (
              <WorkflowRunsTable
                data={registry.data}
                query={query}
                runsURL={props.runsURL}
                loading={registry.loading}
                onPage={(page) =>
                  router.push(
                    buildWorkflowRunsURL(props.runsURL, { ...query, page }),
                    { scroll: false },
                  )
                }
              />
            ) : registry.loading ? (
              <p className={styles.empty} role="status">
                Загружаем запуски…
              </p>
            ) : null}
          </UiSurface>
        )}
      </main>
    </AdminUiTheme>
  );
};
