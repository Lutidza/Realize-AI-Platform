/**
 * @file src/components/admin/extensions/ExtensionManager.component.tsx
 * @version 1.1.1
 * @date 2026-10-12
 * @description Подключает модуль «Темы и шаблоны» к нейтральному Admin host и безопасным appearance операциям.
 * @see documentation/specifications/extension-management.md
 */
"use client";
import { useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import {
  UiBadge,
  UiButton,
  UiConfirmation,
  UiNotice,
  UiTabs,
} from "@realize/ui-kit";
import type { InstalledTemplateEntryDto } from "@realize/payload-extension-manager/contracts";
import type { TemplateTarget } from "@realize/template-contracts";
import { SystemAdminTemplateHost } from "../system-shell/SystemAdminTemplateHost.component";
import { getSystemAdminNavigation } from "../system-shell/systemAdmin.navigation";
import { SYSTEM_TASK_MANAGER_ROUTE } from "../system-shell/systemAdmin.routes";
import { useSystemAdminNavigationPreferences } from "../system-shell/useSystemAdminNavigationPreferences.hook";
import { useSystemAdminLocale } from "../system-shell/useSystemAdminLocale.hook";
import { useSystemAdminTheme } from "../system-shell/useSystemAdminTheme.hook";
import type { ExtensionManagerProps } from "./ExtensionManager.types";
import { useExtensionManager } from "./useExtensionManager.hook";
import { useExtensionMutationLock } from "./useExtensionMutationLock.hook";
import { useAdminShellManager } from "./useAdminShellManager.hook";
import { AdminShellPicker } from "./AdminShellPicker.component";
import { InstalledTemplates } from "./InstalledTemplates.component";
import { useInstalledTemplates } from "./useInstalledTemplates.hook";
import { focusExtensionSection } from "./focusExtensionSection.adapter";
import { ExtensionAppearanceEditor } from "./ExtensionAppearanceEditor.component";
import { ExtensionAppearancePlan } from "./ExtensionAppearancePlan.component";
import { ExtensionAppearanceHistory } from "./ExtensionAppearanceHistory.component";
import styles from "./ExtensionManager.module.css";

/** Controller и UUID принадлежат модулю над Renderer, а не конкретному template layout. */
export function ExtensionManager(props: ExtensionManagerProps) {
  const lock = useExtensionMutationLock();
  const manager = useExtensionManager(props, undefined, lock);
  const shell = useAdminShellManager(manager.snapshot, lock);
  const installed = useInstalledTemplates();
  useEffect(() => {
    if (manager.receipt || shell.receipt)
      void Promise.resolve().then(installed.refresh);
  }, [manager.receipt, shell.receipt, installed.refresh]);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (manager.commandError || manager.loadError) errorRef.current?.focus();
  }, [manager.commandError, manager.loadError]);
  const { theme, setTheme } = useSystemAdminTheme(props);
  const { locale, setLocale } = useSystemAdminLocale();
  const preferences = useSystemAdminNavigationPreferences();
  const openPackageSettings = (entry: InstalledTemplateEntryDto) => {
    if (
      lock.getSnapshot() ||
      manager.loading ||
      installed.loading ||
      !entry.actions.settings
    )
      return;
    if (manager.selectTemplate(`${entry.id}@${entry.version}`))
      focusExtensionSection("appearance-assignment");
  };
  const selectInstalled = (entry: InstalledTemplateEntryDto) => {
    if (
      lock.getSnapshot() ||
      manager.loading ||
      shell.loading ||
      installed.loading ||
      !entry.actions.select
    )
      return;
    if (entry.kind === "builtin") {
      if (!shell.canManage) return;
      shell.select("native");
      focusExtensionSection("admin-shell-assignment");
    } else if (manager.selectTemplate(`${entry.id}@${entry.version}`))
      focusExtensionSection("appearance-assignment");
  };
  const content = (target: TemplateTarget) =>
    manager.target !== target ? null : (
      <div className={styles.stack}>
        <InstalledTemplates
          snapshot={installed.snapshot}
          target={target}
          loading={installed.loading}
          error={installed.error}
          locked={manager.locked || shell.locked}
          onRefresh={() => {
            void installed.refresh();
          }}
          onSelect={selectInstalled}
          onSettings={openPackageSettings}
        />
        {manager.draft ? (
          <ExtensionAppearanceEditor
            entries={manager.entries}
            draft={manager.draft}
            active={manager.snapshot?.targets[target].current ?? null}
            revision={manager.snapshot?.targets[target].revision ?? 0}
            disabled={manager.locked || !manager.canManage}
            canPrepare={manager.canManage && !manager.locked}
            onTemplateChange={manager.selectTemplate}
            onPaletteChange={manager.selectPalette}
            onModeChange={manager.setMode}
            onSettingsChange={manager.setSettings}
            onPrepare={() => {
              void manager.prepare();
            }}
          />
        ) : (
          !manager.loading && (
            <UiNotice
              id="appearance-assignment"
              title="Оформление пока недоступно"
            >
              В сборку не включён подходящий шаблон для этой поверхности.
              Назначение появится после поставки совместимого пакета.
            </UiNotice>
          )
        )}
        {manager.plan?.target === target && (
          <ExtensionAppearancePlan
            plan={manager.plan}
            disabled={manager.locked || !manager.canManage}
            invalidReason={manager.invalidPlanReason}
            onApply={() => {
              void manager.apply();
            }}
            onDiscard={manager.discardPlan}
          />
        )}
        {manager.snapshot && (
          <ExtensionAppearanceHistory
            history={manager.snapshot.history}
            target={target}
            previous={manager.snapshot.targets[target].previous}
            disabled={manager.locked || !manager.canManage}
            onRecover={() => {
              void manager.recover();
            }}
          />
        )}
      </div>
    );
  return (
    <SystemAdminTemplateHost
      screen="workspace"
      mode={theme}
      onModeChange={setTheme}
      locale={locale}
      onLocaleChange={setLocale}
      {...preferences}
      navigation={getSystemAdminNavigation({
        onTasks: () => window.location.assign(SYSTEM_TASK_MANAGER_ROUTE),
      })}
      activeNavigationId="themes"
      context="Темы и шаблоны"
      capabilities={{
        account: {
          user: {
            name: props.currentActor.name,
            initials: props.currentActor.name.slice(0, 2).toUpperCase(),
          },
          profileActions: [],
        },
      }}
      pageActions={[
        {
          id: "refresh-appearance",
          label: "Обновить статус",
          icon: <RefreshCw size={16} aria-hidden="true" />,
          disabled:
            manager.loading ||
            shell.loading ||
            installed.loading ||
            manager.pending?.state === "sending" ||
            shell.pending?.state === "sending",
          onSelect: () => {
            void manager.refresh();
            void shell.refresh();
            void installed.refresh();
          },
        },
      ]}
      footer={
        <span role="status" aria-live="polite" className={styles.muted}>
          {manager.notice}
        </span>
      }
    >
      <div className={styles.workbench}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.heading}>Темы и шаблоны</h1>
            <p className={styles.intro}>
              Выберите оформление Admin и сайта, проверьте изменения в
              предпросмотре и сохраните точное назначение.
            </p>
          </div>
          {installed.snapshot && (
            <UiBadge>{installed.snapshot.entries.length} в установке</UiBadge>
          )}
        </header>
        {(manager.commandError || manager.loadError) && (
          <div ref={errorRef} className={styles.error} tabIndex={-1}>
            <UiNotice
              tone="danger"
              role="alert"
              title={
                manager.pending?.state === "uncertain"
                  ? "Исход операции ещё не подтверждён"
                  : "Не удалось выполнить запрос"
              }
            >
              <p>{manager.commandError?.message ?? manager.loadError}</p>
              {manager.pending?.state === "uncertain" ? (
                <>
                  <p>
                    Настройки и план заблокированы до выяснения результата.
                    Повтор отправит ту же операцию.
                  </p>
                  <UiButton
                    variant="secondary"
                    size="small"
                    onClick={() => {
                      void manager.retry();
                    }}
                  >
                    Повторить ту же операцию
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
                    Повторить загрузку
                  </UiButton>
                )
              )}
            </UiNotice>
          </div>
        )}
        {manager.pending?.state === "sending" && (
          <UiNotice role="status" aria-live="polite">
            {manager.pending.kind === "prepare"
              ? "Подготавливается план…"
              : "Применяется подготовленный план…"}{" "}
            Дождитесь подтверждённого ответа.
          </UiNotice>
        )}
        {manager.receipt && (
          <UiNotice tone="positive" role="status" title="Оформление сохранено">
            Ревизия {manager.receipt.appliedRevision}. Новое оформление
            применяется при следующем открытии страницы; этот экран остаётся
            открытым.
          </UiNotice>
        )}
        {manager.snapshot?.storage === "requires_schema" && (
          <UiNotice title="Хранилище оформления не подготовлено">
            Каталог доступен для просмотра. Сохранение станет доступно после
            подготовки платформы администратором системы.
          </UiNotice>
        )}
        {props.appearance.requiresRecovery && (
          <UiNotice title="Сохранённый шаблон недоступен">
            Этот экран временно использует доступное встроенное оформление.
            Выберите совместимый пакет и подготовьте новое назначение.
          </UiNotice>
        )}
        {props.adminShell?.requiresRecovery && (
          <UiNotice title="Сохранённая оболочка недоступна">
            Платформа открыла доступную рабочую область. Выберите разрешённую
            оболочку и подготовьте новый план; назначение оформления сохранено
            отдельно.
          </UiNotice>
        )}
        {manager.snapshot && !manager.snapshot.permissions.manageAppearance && (
          <UiNotice>
            У текущего пользователя нет права изменять назначение оформления.
          </UiNotice>
        )}
        <AdminShellPicker manager={shell} />
        <UiTabs
          label="Поверхность оформления"
          appearance="underline"
          value={manager.target}
          disabled={manager.locked}
          onValueChange={(value) => manager.setTarget(value as TemplateTarget)}
          items={[
            { id: "admin", label: "Admin", content: content("admin") },
            { id: "frontend", label: "Frontend", content: content("frontend") },
          ]}
        />
        <UiConfirmation
          open={manager.templateChange !== null}
          onOpenChange={(open) => {
            if (!open) manager.cancelTemplateChange();
          }}
          mode={theme}
          title="Заменить несохранённый черновик?"
          subject={manager.templateChange?.name ?? "Другой шаблон"}
          description="При выборе другой версии текущий черновик настроек будет заменён. Сохранённое назначение не изменится до применения подготовленного плана."
          confirmLabel="Заменить черновик"
          blockedReason={
            manager.locked
              ? "Сначала подтвердите исход текущей операции."
              : undefined
          }
          onConfirm={() => {
            if (manager.confirmTemplateChange())
              requestAnimationFrame(() =>
                focusExtensionSection("appearance-assignment"),
              );
          }}
        />
        {manager.snapshot && (
          <UiNotice title="Установка нового кода пока недоступна">
            Этот каталог показывает пакеты, уже включённые в сборку. Для
            установки новых пакетов нужна подготовка платформы разработчиком.
          </UiNotice>
        )}
      </div>
    </SystemAdminTemplateHost>
  );
}
