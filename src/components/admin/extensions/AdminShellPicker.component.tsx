/**
 * @file src/components/admin/extensions/AdminShellPicker.component.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Размещает независимый выбор встроенных оболочек перед настройками оформления Admin.
 */
"use client";
import { useEffect, useRef } from "react";
import {
  UiBadge,
  UiButton,
  UiNotice,
  UiSelect,
  UiSurface,
  getUiButtonClassName,
} from "@realize/ui-kit";
import type { AdminShellMode } from "@realize/payload-extension-manager/contracts";
import type { AdminShellPickerProps } from "./AdminShellPicker.types";
import { AdminShellPlan } from "./AdminShellPlan.component";
import { AdminShellHistory } from "./AdminShellHistory.component";
import { adminShellLabel } from "./adminShellPresentation.util";
import styles from "./ExtensionManager.module.css";

export function AdminShellPicker({ manager }: AdminShellPickerProps) {
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (manager.commandError || manager.loadError) errorRef.current?.focus();
  }, [manager.commandError, manager.loadError]);
  const snapshot = manager.snapshot;
  return (
    <section
      id="admin-shell-assignment"
      className={styles.stack}
      aria-label="Оболочка Admin"
    >
      <UiSurface className={styles.surface}>
        <div className={styles.sectionHeader}>
          <h2>Оболочка Admin</h2>
          {snapshot && (
            <UiBadge>{adminShellLabel(snapshot.state.current)}</UiBadge>
          )}
        </div>
        <p className={styles.muted}>
          Выбор между стандартным интерфейсом Payload и рабочей областью
          Realize. Оформление Realize настраивается отдельно ниже.
        </p>
        {manager.loading && (
          <p role="status" className={styles.muted}>
            Загрузка вариантов оболочки…
          </p>
        )}
        {snapshot && manager.draft && (
          <div className={styles.stack}>
            <div className={styles.catalog}>
              <div className={styles.card}>
                <div className={styles.summary}>
                  <h3>Стандартная Payload</h3>
                  <UiBadge>{snapshot.policy.nativeVersion}</UiBadge>
                </div>
                <p className={styles.muted}>
                  Штатная панель управления Payload с коллекциями и встроенными
                  настройками.
                </p>
                {!snapshot.policy.enabled.native && (
                  <UiNotice>
                    Стандартная оболочка отключена администратором платформы.
                  </UiNotice>
                )}
              </div>
              <div className={styles.card}>
                <h3>Realize</h3>
                <p className={styles.muted}>
                  Самостоятельная рабочая область с выбранным шаблоном
                  оформления Admin.
                </p>
                {!snapshot.policy.enabled.template && (
                  <UiNotice>
                    Оболочка Realize отключена администратором платформы.
                  </UiNotice>
                )}
              </div>
            </div>
            <p className={styles.muted}>
              Текущая оболочка: {adminShellLabel(snapshot.state.current)}.
              Ревизия оболочки: {snapshot.state.revision}.
            </p>
            <label className={styles.field}>
              Выбор оболочки Admin
              <UiSelect
                value={manager.draft}
                disabled={manager.locked || !manager.canManage}
                onChange={(event) =>
                  manager.select(event.currentTarget.value as AdminShellMode)
                }
              >
                <option
                  value="native"
                  disabled={!snapshot.policy.enabled.native}
                >
                  Стандартная Payload
                </option>
                <option
                  value="template"
                  disabled={!snapshot.policy.enabled.template}
                >
                  Realize
                </option>
              </UiSelect>
            </label>
            <div className={styles.actions}>
              <UiButton
                disabled={
                  manager.locked ||
                  !manager.canManage ||
                  !snapshot.policy.enabled[manager.draft]
                }
                onClick={() => {
                  void manager.prepare();
                }}
              >
                Подготовить смену оболочки
              </UiButton>
            </div>
            {snapshot.storage === "requires_schema" && (
              <UiNotice>
                Выбор доступен для просмотра. Сохранение станет доступно после
                подготовки платформы администратором системы.
              </UiNotice>
            )}
            {!snapshot.permissions.manageShell && (
              <UiNotice>
                У текущего пользователя нет права изменять оболочку Admin.
              </UiNotice>
            )}
          </div>
        )}
      </UiSurface>
      {(manager.commandError || manager.loadError) && (
        <div ref={errorRef} className={styles.error} tabIndex={-1}>
          <UiNotice
            tone="danger"
            role="alert"
            title={
              manager.pending?.state === "uncertain"
                ? "Исход смены оболочки ещё не подтверждён"
                : "Не удалось выполнить запрос оболочки"
            }
          >
            <p>{manager.commandError?.message ?? manager.loadError}</p>
            {manager.pending?.state === "uncertain" ? (
              <>
                <p>
                  Операции оболочки и оформления заблокированы. Повтор отправит
                  ту же операцию.
                </p>
                <UiButton
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    void manager.retry();
                  }}
                >
                  Повторить операцию оболочки
                </UiButton>
              </>
            ) : (
              manager.loadError && (
                <UiButton
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    void manager.refresh();
                  }}
                >
                  Повторить загрузку оболочки
                </UiButton>
              )
            )}
          </UiNotice>
        </div>
      )}
      {manager.pending?.state === "sending" && (
        <UiNotice role="status">
          {manager.pending.kind === "prepare"
            ? "Подготавливается план оболочки…"
            : "Применяется план оболочки…"}{" "}
          Дождитесь подтверждённого ответа.
        </UiNotice>
      )}
      {manager.receipt && snapshot && (
        <UiNotice tone="positive" role="status" title="Оболочка сохранена">
          <p>
            Выбрана {adminShellLabel(manager.receipt.mode)}. Этот экран и
            черновик оформления остаются открытыми.
          </p>
          <a
            href={
              manager.receipt.mode === "native"
                ? snapshot.policy.nativeRoute
                : snapshot.policy.templateRoute
            }
            className={getUiButtonClassName({
              variant: "secondary",
              size: "small",
            })}
          >
            Открыть выбранную рабочую область
          </a>
        </UiNotice>
      )}
      {manager.plan && (
        <AdminShellPlan
          plan={manager.plan}
          disabled={manager.locked || !manager.canManage}
          invalidReason={manager.invalidPlanReason}
          onApply={() => {
            void manager.apply();
          }}
          onDiscard={manager.discardPlan}
        />
      )}
      {snapshot && (
        <AdminShellHistory
          history={snapshot.history}
          previous={snapshot.state.previous}
          disabled={
            manager.locked ||
            !manager.canManage ||
            !snapshot.state.previous ||
            !snapshot.policy.enabled[snapshot.state.previous]
          }
          onRecover={() => {
            void manager.recover();
          }}
        />
      )}
    </section>
  );
}
