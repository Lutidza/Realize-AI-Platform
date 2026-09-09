/**
 * @file packages/payload-ai-plugin/src/admin/integrations/IntegrationFormSection.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Отображает именованную секцию формы интеграции с иконкой и пояснением.
 */

"use client";

import { UiSurface } from "@realize/ui-kit";

import styles from "./IntegrationFormSection.module.css";
import type { IntegrationFormSectionProps } from "./IntegrationFormSection.types";

/** Объединяет поля в доступную секцию без собственного состояния и бизнес-логики. */
export const IntegrationFormSection = ({
  children,
  description,
  icon,
  title,
}: IntegrationFormSectionProps) => (
  <UiSurface asChild>
    <section aria-label={title} className={styles.formSection}>
      <header className={styles.sectionHeader}>
        <UiSurface asChild tone="raised">
          <span aria-hidden="true" className={styles.sectionIcon}>
            {icon}
          </span>
        </UiSurface>
        <div className={styles.sectionHeading}>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  </UiSurface>
);
