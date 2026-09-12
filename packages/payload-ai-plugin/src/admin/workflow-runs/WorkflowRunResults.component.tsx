/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunResults.component.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Показывает только типизированные публичные результаты шагов процесса.
 */

import type { WorkflowRunContentProps } from "./WorkflowRuns.types";
import { UiNotice } from "@realize/ui-kit";
import { workflowStepLabels } from "./workflowRunsPresentation.config";
import styles from "./WorkflowRuns.module.css";

export const WorkflowRunResults = ({ detail }: WorkflowRunContentProps) => {
  const steps = detail.steps.filter((step) => step.result);
  return (
    <div className={styles.stack}>
      {steps.length ? (
        steps.map((step) => {
          const result = step.result!;
          return (
            <details className={styles.result} key={step.key}>
              <summary>
                <strong>{step.title || step.key}</strong>
                <span>{workflowStepLabels[step.type]}</span>
              </summary>
              <div className={styles.resultContent}>
                {result.type === "text" ? (
                  <>
                    <div className={styles.text}>{result.text}</div>
                    {result.truncated ? (
                      <UiNotice>Показан сокращённый текст результата.</UiNotice>
                    ) : null}
                  </>
                ) : null}
                {result.type === "branch" ? (
                  <p>
                    Условие {result.matched ? "выполнено" : "не выполнено"}.
                  </p>
                ) : null}
                {result.type === "finish" ? (
                  <p>
                    Итог:{" "}
                    {result.outcome === "completed"
                      ? "завершён"
                      : result.outcome === "blocked"
                        ? "заблокирован"
                        : result.outcome}
                  </p>
                ) : null}
                {result.type === "capability" || result.type === "check" ? (
                  <dl className={styles.metadata}>
                    <div>
                      <dt>Операция</dt>
                      <dd>{result.dataOperationID}</dd>
                    </div>
                    <div>
                      <dt>Hash операции</dt>
                      <dd>{result.operationHash}</dd>
                    </div>
                    <div>
                      <dt>Состояние шага</dt>
                      <dd>
                        {result.type === "capability"
                          ? result.state
                          : result.status}
                      </dd>
                    </div>
                    {result.type === "check" ? (
                      <>
                        <div>
                          <dt>Проверка</dt>
                          <dd>{result.checkID}</dd>
                        </div>
                        <div>
                          <dt>Hash результата</dt>
                          <dd>{result.evidenceHash}</dd>
                        </div>
                      </>
                    ) : null}
                  </dl>
                ) : null}
              </div>
            </details>
          );
        })
      ) : (
        <p className={styles.empty}>Сохранённых результатов пока нет.</p>
      )}
    </div>
  );
};
