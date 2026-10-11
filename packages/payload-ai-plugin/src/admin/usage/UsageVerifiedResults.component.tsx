/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsageVerifiedResults.component.tsx
 * @version 1.0.1
 * @date 2026-10-06
 * @description Отделяет стоимость подтверждённого исполнения до preview от показателей model attempts.
 */
import { UiSurface } from "@realize/ui-kit";
import type { UsagePageData } from "./UsageView.types";
import { usageBasisLabels } from "./usageLabels.config";
import {
  formatUsageAmount,
  formatUsageCount,
} from "./usageAnalyticsPresentation.util";
import styles from "./Usage.module.css";

export function UsageVerifiedResults({ data }: { data: UsagePageData }) {
  return (
    <UiSurface className={`${styles.surface} ${styles.stack}`}>
      <div>
        <h2>Стоимость подтверждённого результата</h2>
        <p className={styles.muted}>
          Исполнение до проверенного preview ·{" "}
          {formatUsageCount(data.verifiedTasks.successfulTasks)} подтверждённых
          задач
        </p>
        <p className={styles.muted}>
          Полные задачи за период подтверждения. Фильтры агента, модели и типа
          работы эту сводку не ограничивают.
        </p>
      </div>
      {data.verifiedTasks.amounts.length ? (
        <div className={styles.grid}>
          {data.verifiedTasks.amounts.map((amount) => (
            <div key={`${amount.basis}:${amount.currency}`}>
              <span className={styles.muted}>
                {usageBasisLabels[amount.basis]}
              </span>
              <strong className={styles.metric}>
                {formatUsageAmount(amount.averageNanos, amount.currency)}
              </strong>
              <span>на задачу · полностью измерено {amount.pricedTasks}</span>
            </div>
          ))}
        </div>
      ) : (
        <p>
          Средняя стоимость появится после полностью измеренных задач с
          подтверждённым preview.
        </p>
      )}
      <details>
        <summary>Как считается эта метрика</summary>
        <p>
          Учитываются все попытки исполнения до готового preview, включая
          ошибки, после проверок и независимого review. Срез — период
          подтверждения, установка, проект и назначение. Детальные фильтры не
          отсекают остальные расходы задачи. Подготовка плана в чате учитывается
          отдельно.
        </p>
        {Object.entries(data.verifiedTasks.unknownByBasis).map(
          ([basis, count]) =>
            count ? (
              <p key={basis}>
                {usageBasisLabels[basis]}: неполных оценок задач — {count}.
              </p>
            ) : null,
        )}
      </details>
    </UiSurface>
  );
}
