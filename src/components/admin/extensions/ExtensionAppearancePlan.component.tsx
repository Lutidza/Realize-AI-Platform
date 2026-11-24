/**
 * @file src/components/admin/extensions/ExtensionAppearancePlan.component.tsx
 * @version 1.1.0
 * @date 2026-11-12
 * @description Показывает immutable appearance plan, preview и разрешённое применение.
 */
import {
  UiBadge,
  UiButton,
  UiNotice,
  UiSurface,
  getUiButtonClassName,
} from "@realize/ui-kit";
import type { ExtensionAppearancePlanProps } from "./ExtensionManagerUi.types";
import { systemAppearancePreviewRoute } from "../system-shell/systemAdmin.routes";
import { EXTENSION_PREVIEW_ONLY_MESSAGE } from "./extensionReadiness.constants";
import styles from "./ExtensionManager.module.css";

export function ExtensionAppearancePlan({
  plan,
  disabled,
  invalidReason,
  readiness,
  onApply,
  onDiscard,
}: ExtensionAppearancePlanProps) {
  const desired = plan.desiredAssignment;
  return (
    <UiSurface className={styles.surface} aria-label="Подготовленный план">
      <div className={styles.sectionHeader}>
        <h2>
          {plan.action === "recover" ? "План восстановления" : "План изменения"}
        </h2>
        <UiBadge>{plan.target === "admin" ? "Admin" : "Frontend"}</UiBadge>
      </div>
      <div className={styles.stack}>
        <div className={styles.summary}>
          <strong>
            {desired.selection.templateId} {desired.selection.templateVersion}
          </strong>
          <span>
            {desired.selection.paletteId} ·{" "}
            {desired.selection.mode === "light" ? "Светлый" : "Тёмный"}
          </span>
        </div>
        <p className={styles.muted}>
          План действует до {new Date(plan.expiresAt).toLocaleString("ru-RU")}.
          Исходная ревизия: {plan.expectedRevision}.
        </p>
        <pre
          className={styles.settingsPreview}
          aria-label="Настройки подготовленного плана"
        >
          {JSON.stringify(desired.settings, null, 2)}
        </pre>
        {readiness === "preview-only" && (
          <UiNotice role="status">{EXTENSION_PREVIEW_ONLY_MESSAGE}</UiNotice>
        )}
        {invalidReason && (
          <UiNotice tone="danger" role="alert">
            {invalidReason}
          </UiNotice>
        )}
        <div className={styles.actions}>
          <a
            href={systemAppearancePreviewRoute(plan.planId)}
            target="_blank"
            rel="noopener noreferrer"
            className={getUiButtonClassName({
              variant: "secondary",
              size: "small",
            })}
          >
            Предпросмотр
          </a>
          <UiButton
            disabled={
              disabled || Boolean(invalidReason) || readiness === "preview-only"
            }
            onClick={onApply}
          >
            Применить план
          </UiButton>
          <UiButton variant="ghost" disabled={disabled} onClick={onDiscard}>
            Закрыть план
          </UiButton>
        </div>
      </div>
    </UiSurface>
  );
}
