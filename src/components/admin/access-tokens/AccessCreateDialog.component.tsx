/**
 * @file src/components/admin/access-tokens/AccessCreateDialog.component.tsx
 * @version 1.0.0
 * @date 2026-10-19
 * @description Запрашивает имя, назначение, срок и минимальные права нового доступа.
 * @see documentation/architecture/platform-access.md
 */
"use client";
import { useRef } from "react";
import {
  UiButton,
  UiDialog,
  UiInput,
  UiNotice,
  UiSelect,
  UiSwitch,
} from "@realize/ui-kit";
import type { AccessCreateDialogProps } from "./AccessTokens.types";
import { useAccessCreateForm } from "./useAccessCreateForm.hook";
import styles from "./AccessTokens.module.css";

export function AccessCreateDialog(props: AccessCreateDialogProps) {
  const form = useAccessCreateForm(props.onCreate);
  const nameRef = useRef<HTMLInputElement>(null);
  return (
    <UiDialog
      open={props.open}
      mode={props.mode}
      initialFocusRef={nameRef}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      title="Создать доступ"
      description="Токен будет работать от вашего имени, в пределах выбранных прав и доступных вам проектов."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit();
        }}
        className={styles.stack}
      >
        <fieldset disabled={props.busy} className={styles.fieldset}>
          <label className={styles.field}>
            Название доступа
            <UiInput
              ref={nameRef}
              value={form.name}
              onChange={(event) => form.setName(event.target.value)}
              required
              maxLength={100}
              autoComplete="off"
              placeholder="Например, отчёты команды"
            />
          </label>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Назначение
              <UiSelect
                value={form.kind}
                onChange={(event) =>
                  form.setKind(
                    event.target.value === "api" ? "api" : "personal",
                  )
                }
              >
                <option value="personal">Личный токен</option>
                <option value="api">Инструмент или API</option>
              </UiSelect>
            </label>
            <label className={styles.field}>
              Срок, дней
              <UiInput
                type="number"
                value={form.expiresInDays}
                onChange={(event) => form.setExpiresInDays(event.target.value)}
                min={1}
                max={365}
                step={1}
                required
              />
            </label>
          </div>
          <fieldset className={styles.fieldset}>
            <legend>Разрешения</legend>
            {props.scopes.map((scope) => (
              <label key={scope.id} className={styles.scopeField}>
                <UiSwitch
                  checked={form.scopes.includes(scope.id)}
                  disabled={scope.id === "task-manager:read"}
                  onChange={(event) =>
                    form.toggleScope(scope.id, event.target.checked)
                  }
                />
                <span>
                  <strong>
                    {scope.label}
                    {scope.id === "task-manager:read" ? " · обязательно" : ""}
                  </strong>
                  <span className={styles.help}>{scope.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </fieldset>
        {(form.error || props.error) && (
          <UiNotice tone="danger" role="alert">
            {form.error || props.error}
          </UiNotice>
        )}
        <div className={styles.actions}>
          <UiButton type="submit" disabled={props.busy}>
            {props.busy ? "Создание…" : "Создать токен"}
          </UiButton>
          <UiButton
            type="button"
            variant="secondary"
            disabled={props.busy}
            onClick={props.onClose}
          >
            Отмена
          </UiButton>
        </div>
      </form>
    </UiDialog>
  );
}
