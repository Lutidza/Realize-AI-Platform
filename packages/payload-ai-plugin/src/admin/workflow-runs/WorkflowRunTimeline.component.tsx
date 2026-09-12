/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunTimeline.component.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Отображает фактические шаги и времена сегментов без выдуманных событий выполнения.
 */

import type { WorkflowRunContentProps } from "./WorkflowRuns.types";
import { UiBadge } from "@realize/ui-kit";
import {
  workflowDate,
  workflowStepLabels,
} from "./workflowRunsPresentation.config";
import styles from "./WorkflowRuns.module.css";

const labels = {
  completed: "Выполнен",
  current: "Текущий шаг",
  skipped: "Пропущен",
  pending: "Не выполнен",
};
export const WorkflowRunTimeline = ({ detail }: WorkflowRunContentProps) => (
  <div className={styles.stack}>
    <p className={styles.muted}>
      Время относится к запуску сегмента. Один сегмент может выполнять несколько
      шагов.
    </p>
    <ol className={styles.timeline}>
      {detail.steps.map((step, index) => {
        const segment = detail.segments.find(
          (item) => item.run.id === step.segmentRunID,
        );
        return (
          <li
            key={step.key}
            aria-current={step.status === "current" ? "step" : undefined}
          >
            <span className={styles.stepNumber}>{index + 1}</span>
            <div className={styles.stepBody}>
              <div className={styles.resultBar}>
                <strong>{step.title || step.key}</strong>
                <UiBadge
                  tone={step.status === "completed" ? "positive" : "neutral"}
                >
                  {labels[step.status]}
                </UiBadge>
              </div>
              <span className={styles.muted}>
                {workflowStepLabels[step.type]} · <code>{step.key}</code>
              </span>
              {segment ? (
                <span className={styles.muted}>
                  Сегмент {segment.run.id} ·{" "}
                  {workflowDate(segment.run.startedAt ?? segment.run.createdAt)}{" "}
                  UTC
                  {segment.run.finishedAt
                    ? ` — ${workflowDate(segment.run.finishedAt)} UTC`
                    : ""}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  </div>
);
