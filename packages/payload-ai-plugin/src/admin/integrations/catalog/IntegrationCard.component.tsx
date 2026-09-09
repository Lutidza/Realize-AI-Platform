/**
 * @file packages/payload-ai-plugin/src/admin/integrations/catalog/IntegrationCard.component.tsx
 * @version 1.0.2
 * @date 2026-09-09
 * @description Собирает карточку сервиса из общей поверхности, статуса и данных каталога.
 */

"use client";

import { Link } from "@payloadcms/ui";
import { UiBadge, UiSurface } from "@realize/ui-kit";
import { ArrowUpRight } from "lucide-react";
import { useId } from "react";
import type { IntegrationCardProps } from "./IntegrationCatalog.types";
import { integrationPresentation } from "./integrationPresentation.config";
import styles from "./IntegrationCard.module.css";

export const IntegrationCard = ({
  href,
  isActive,
  provider,
}: IntegrationCardProps) => {
  const { Logo } = integrationPresentation[provider.id];
  const descriptionId = useId();
  const statusId = useId();
  return (
    <li>
      <UiSurface asChild className={styles.card} interactive tone="accent">
        <Link
          aria-describedby={`${descriptionId} ${statusId}`}
          aria-label={`Настроить ${provider.name}`}
          href={href}
        >
          <Logo aria-hidden="true" className={styles.brandMark} />
          <div className={styles.cardHeader}>
            <UiSurface asChild className={styles.logoTile} tone="raised">
              <span aria-hidden="true">
                <Logo className={styles.logo} />
              </span>
            </UiSurface>
            <UiBadge dot id={statusId} tone={isActive ? "positive" : "neutral"}>
              {isActive ? "Активна" : "Неактивна"}
            </UiBadge>
          </div>
          <div className={styles.cardBody}>
            <h2>{provider.name}</h2>
            <p id={descriptionId}>{provider.description}</p>
          </div>
          <div className={styles.cardFooter}>
            <span>Настроить</span>
            <UiSurface asChild className={styles.actionIcon} tone="raised">
              <span aria-hidden="true">
                <ArrowUpRight size={18} />
              </span>
            </UiSurface>
          </div>
        </Link>
      </UiSurface>
    </li>
  );
};
