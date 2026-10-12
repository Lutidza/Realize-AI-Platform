/**
 * @file src/components/admin/extensions/ExtensionAppearanceHistory.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Отображает применённые receipts и подготовку восстановления предыдущего назначения.
 */
import { UiButton, UiSurface } from "@realize/ui-kit";
import type { ExtensionAppearanceHistoryProps } from "./ExtensionManagerUi.types";
import styles from "./ExtensionManager.module.css";

export function ExtensionAppearanceHistory({
  history,
  target,
  previous,
  disabled,
  onRecover,
}: ExtensionAppearanceHistoryProps) {
  const items = history
    .filter((receipt) => receipt.target === target)
    .reverse();
  return (
    <UiSurface id="appearance-history" className={styles.surface}>
      <div className={styles.sectionHeader}>
        <h2>История назначений</h2>
        <UiButton
          variant="secondary"
          size="small"
          disabled={disabled || !previous}
          onClick={onRecover}
        >
          Подготовить восстановление
        </UiButton>
      </div>
      {previous && (
        <p className={styles.muted}>
          Предыдущее: {previous.selection.templateId}{" "}
          {previous.selection.templateVersion}. Восстановление также требует
          проверки плана.
        </p>
      )}
      {!items.length ? (
        <p className={styles.muted}>
          На этой поверхности ещё нет применённых изменений.
        </p>
      ) : (
        <ol className={styles.history}>
          {items.map((receipt) => (
            <li key={receipt.planId} className={styles.historyItem}>
              <div>
                <strong>Ревизия {receipt.appliedRevision}</strong>
                <p className={styles.muted}>
                  {receipt.assignment.selection.templateId}{" "}
                  {receipt.assignment.selection.templateVersion} ·{" "}
                  {receipt.assignment.selection.paletteId} ·{" "}
                  {receipt.assignment.selection.mode === "light"
                    ? "Светлый"
                    : "Тёмный"}
                </p>
              </div>
              <time className={styles.muted} dateTime={receipt.appliedAt}>
                {new Date(receipt.appliedAt).toLocaleString("ru-RU")}
              </time>
            </li>
          ))}
        </ol>
      )}
    </UiSurface>
  );
}
