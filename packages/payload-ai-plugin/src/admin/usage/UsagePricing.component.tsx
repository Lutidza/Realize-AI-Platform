/**
 * @file packages/payload-ai-plugin/src/admin/usage/UsagePricing.component.tsx
 * @version 1.0.0
 * @date 2026-10-05
 * @description Собирает существующие owner формы тарифов и сверки в отдельную вкладку аналитики.
 */
import { UiSurface } from "@realize/ui-kit";
import type { UsageFormProps } from "./UsageView.types";
import { UsagePriceForm } from "./UsagePriceForm.component";
import { UsageReconcileForm } from "./UsageReconcileForm.component";
import { UsageRecoveryForm } from "./UsageRecoveryForm.component";
import { usageBasisLabels } from "./usageLabels.config";
import styles from "./Usage.module.css";

export function UsagePricing(props: UsageFormProps) {
  if (!("prices" in props.data)) return null;
  return (
    <UiSurface className={`${styles.surface} ${styles.stack}`}>
      <div>
        <h2>Тарифы и сверка</h2>
        <p className={styles.muted}>
          Установка для новых тарифов: {props.data.installationId}. Публикаций в
          истории: {props.data.prices.length}.
        </p>
      </div>
      <details>
        <summary>История тарифов</summary>
        <div className={styles.stack}>
          {props.data.prices.map((price) => (
            <p key={price.pricingId} className={styles.details}>
              {usageBasisLabels[price.basis]} · {price.model} · {price.authMode}{" "}
              · {price.currency} · ревизия {price.revision}
              <br />
              {price.pricingId} · {price.sourceRef}
            </p>
          ))}
        </div>
      </details>
      <UsagePriceForm {...props} />
      <UsageReconcileForm {...props} />
      <UsageRecoveryForm {...props} />
    </UiSurface>
  );
}
