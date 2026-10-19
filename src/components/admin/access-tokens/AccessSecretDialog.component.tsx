/**
 * @file src/components/admin/access-tokens/AccessSecretDialog.component.tsx
 * @version 1.0.0
 * @date 2026-10-19
 * @description Показывает выданный секрет один раз и удаляет его из состояния при закрытии.
 * @see documentation/architecture/platform-access.md
 */
"use client";
import { UiButton, UiDialog, UiNotice, UiTextarea } from "@realize/ui-kit";
import type { AccessSecretDialogProps } from "./AccessTokens.types";
import { useAccessSecret } from "./useAccessSecret.hook";
import styles from "./AccessTokens.module.css";

/** Компонент монтируется после POST; SSR и повторная загрузка не получают secret. */
export function AccessSecretDialog({
  created,
  mode,
  onForget,
}: AccessSecretDialogProps) {
  const clipboard = useAccessSecret(created?.secret);
  return (
    <UiDialog
      open={Boolean(created)}
      mode={mode}
      onOpenChange={(open) => {
        if (!open) onForget();
      }}
      title="Сохраните токен"
      description="Он показан только сейчас. После закрытия окна или обновления страницы восстановить его нельзя."
    >
      <div className={styles.stack}>
        <p className={styles.intro}>Доступ «{created?.token.name}» создан.</p>
        <label className={styles.field}>
          Новый токен
          <UiTextarea
            className={styles.secret}
            value={created?.secret ?? ""}
            readOnly
            autoComplete="off"
            spellCheck={false}
            rows={3}
          />
        </label>
        <div className={styles.actions}>
          <UiButton
            onClick={() => {
              void clipboard.copy();
            }}
          >
            Копировать токен
          </UiButton>
          <UiButton variant="secondary" onClick={onForget}>
            Скрыть и закрыть
          </UiButton>
        </div>
        {clipboard.notice && (
          <UiNotice role="status">{clipboard.notice}</UiNotice>
        )}
      </div>
    </UiDialog>
  );
}
