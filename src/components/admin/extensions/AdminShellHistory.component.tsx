/**
 * @file src/components/admin/extensions/AdminShellHistory.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Отображает отдельную историю оболочек и подготовку восстановления предыдущего выбора.
 */
import { UiButton, UiSurface } from "@realize/ui-kit";
import type { AdminShellHistoryProps } from "./AdminShellPicker.types";
import { adminShellLabel } from "./adminShellPresentation.util";
import styles from "./ExtensionManager.module.css";

export function AdminShellHistory({
  history,
  previous,
  disabled,
  onRecover,
}: AdminShellHistoryProps) {
  return (
    <UiSurface className={styles.surface}>
      <div className={styles.sectionHeader}>
        <h2>История оболочек Admin</h2>
        <UiButton
          variant="secondary"
          size="small"
          disabled={disabled || !previous}
          onClick={onRecover}
        >
          Подготовить восстановление оболочки
        </UiButton>
      </div>
      {previous && (
        <p className={styles.muted}>
          Предыдущая оболочка: {adminShellLabel(previous)}. Восстановление
          требует нового плана.
        </p>
      )}
      {!history.length ? (
        <p className={styles.muted}>Изменений выбора оболочки пока нет.</p>
      ) : (
        <ol className={styles.history}>
          {[...history].reverse().map((receipt) => (
            <li key={receipt.planId} className={styles.historyItem}>
              <div>
                <strong>Ревизия оболочки {receipt.appliedRevision}</strong>
                <p className={styles.muted}>{adminShellLabel(receipt.mode)}</p>
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
