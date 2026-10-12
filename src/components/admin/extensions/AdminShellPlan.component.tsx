/**
 * @file src/components/admin/extensions/AdminShellPlan.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Показывает immutable shell plan и отдельный предпросмотр без применения назначения.
 */
import {
  UiBadge,
  UiButton,
  UiNotice,
  UiSurface,
  getUiButtonClassName,
} from "@realize/ui-kit";
import { systemAdminShellPreviewRoute } from "../system-shell/systemAdmin.routes";
import type { AdminShellPlanProps } from "./AdminShellPicker.types";
import { adminShellLabel } from "./adminShellPresentation.util";
import styles from "./ExtensionManager.module.css";

export function AdminShellPlan({
  plan,
  disabled,
  invalidReason,
  onApply,
  onDiscard,
}: AdminShellPlanProps) {
  const assignment = plan.templateBinding?.assignment;
  return (
    <UiSurface
      className={styles.surface}
      role="region"
      aria-label="Подготовленный план оболочки"
    >
      <div className={styles.sectionHeader}>
        <h2>
          {plan.action === "recover"
            ? "План восстановления оболочки"
            : "План смены оболочки"}
        </h2>
        <UiBadge>{adminShellLabel(plan.desiredMode)}</UiBadge>
      </div>
      <div className={styles.stack}>
        <p className={styles.muted}>
          {adminShellLabel(plan.currentMode)} →{" "}
          {adminShellLabel(plan.desiredMode)}. Исходная ревизия оболочки:{" "}
          {plan.expectedRevision}. План действует до{" "}
          {new Date(plan.expiresAt).toLocaleString("ru-RU")}.
        </p>
        {assignment ? (
          <div>
            <p className={styles.muted}>
              План использует текущее назначение оформления Admin:{" "}
              {assignment.selection.templateId}{" "}
              {assignment.selection.templateVersion} ·{" "}
              {assignment.selection.paletteId}{" "}
              {assignment.selection.paletteVersion}. Несохранённый черновик
              оформления в этот план не входит.
            </p>
            <pre
              className={styles.settingsPreview}
              aria-label="Оформление плана оболочки"
            >
              {JSON.stringify(assignment.settings, null, 2)}
            </pre>
          </div>
        ) : (
          <p className={styles.muted}>
            Стандартная оболочка использует собственный интерфейс Payload.
            Назначение оформления Realize сохранится отдельно.
          </p>
        )}
        {invalidReason && (
          <UiNotice tone="danger" role="alert">
            {invalidReason}
          </UiNotice>
        )}
        <div className={styles.actions}>
          <a
            href={systemAdminShellPreviewRoute(plan.planId, plan.desiredMode)}
            target="_blank"
            rel="noopener noreferrer"
            className={getUiButtonClassName({
              variant: "secondary",
              size: "small",
            })}
          >
            Предпросмотр оболочки
          </a>
          <UiButton
            disabled={disabled || Boolean(invalidReason)}
            onClick={onApply}
          >
            Применить оболочку
          </UiButton>
          <UiButton variant="ghost" disabled={disabled} onClick={onDiscard}>
            Закрыть план оболочки
          </UiButton>
        </div>
      </div>
    </UiSurface>
  );
}
