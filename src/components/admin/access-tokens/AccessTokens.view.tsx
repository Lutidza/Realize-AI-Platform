/**
 * @file src/components/admin/access-tokens/AccessTokens.view.tsx
 * @version 1.0.0
 * @date 2026-10-19
 * @description Отображает центр доступов, owner фильтр и подтверждённые операции отзыва.
 * @see documentation/architecture/platform-access.md
 */
"use client";
import Link from "next/link";
import {
  UiButton,
  UiConfirmation,
  UiInput,
  UiNotice,
  UiSurface,
} from "@realize/ui-kit";
import {
  SYSTEM_ACCESS_DEVICE_ROUTE,
  SYSTEM_ACCESS_ROUTE,
  systemUserAccessRoute,
} from "../system-shell/systemAdmin.routes";
import type { AccessTokensViewProps } from "./AccessTokens.types";
import { AccessCreateDialog } from "./AccessCreateDialog.component";
import { AccessSecretDialog } from "./AccessSecretDialog.component";
import { AccessTokenCard } from "./AccessTokenCard.component";
import styles from "./AccessTokens.module.css";

export function AccessTokensView({
  manager,
  mode,
  cliLoginCommand,
}: AccessTokensViewProps) {
  return (
    <div className={styles.workbench}>
      <header className={styles.header}>
        <div>
          <h1>Доступы и токены</h1>
          <p className={styles.intro}>
            Управляйте доступом CLI и инструментов к платформе. Каждый токен
            имеет своё назначение, срок и разрешения.
          </p>
        </div>
        <div className={styles.actions}>
          <UiButton
            variant="secondary"
            disabled={manager.loading || manager.busy}
            onClick={() => {
              void manager.refresh();
            }}
          >
            Обновить список
          </UiButton>
          {manager.isSelf && (
            <UiButton
              disabled={
                manager.loading || manager.busy || Boolean(manager.loadError)
              }
              onClick={manager.openCreate}
            >
              Создать доступ
            </UiButton>
          )}
        </div>
      </header>
      {manager.context && (
        <UiSurface className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>
              {manager.isSelf
                ? `Мои доступы · ${manager.context.actor.name}`
                : `Доступы пользователя ${manager.ownerId}`}
            </h2>
            {!manager.isSelf && <a href={SYSTEM_ACCESS_ROUTE}>Мои доступы</a>}
          </div>
          {!manager.isSelf && (
            <p className={styles.intro}>
              Владелец платформы может просматривать и отзывать эти доступы.
              Новый токен создаётся только от своего имени.
            </p>
          )}
          {manager.context.canManageOthers && (
            <form
              className={styles.ownerForm}
              onSubmit={(event) => {
                event.preventDefault();
                const value = String(
                  new FormData(event.currentTarget).get("ownerId") ?? "",
                ).trim();
                window.location.assign(
                  value ? systemUserAccessRoute(value) : SYSTEM_ACCESS_ROUTE,
                );
              }}
            >
              <label className={styles.field}>
                ID пользователя
                <UiInput
                  name="ownerId"
                  maxLength={128}
                  defaultValue={manager.ownerId ?? ""}
                  placeholder="Пустое поле — мои доступы"
                  disabled={manager.busy}
                />
              </label>
              <UiButton
                variant="secondary"
                type="submit"
                disabled={manager.busy}
              >
                Показать доступы
              </UiButton>
            </form>
          )}
        </UiSurface>
      )}
      {manager.loadError && (
        <UiNotice
          role="alert"
          tone="danger"
          title="Не удалось загрузить доступы"
        >
          {manager.loadError}
        </UiNotice>
      )}
      {manager.commandError && !manager.createOpen && !manager.revokeTarget && (
        <UiNotice role="alert" tone="danger">
          {manager.commandError}
        </UiNotice>
      )}
      {manager.notice && (
        <UiNotice role="status" tone="positive">
          {manager.notice}
        </UiNotice>
      )}
      <section
        className={styles.stack}
        aria-label="Список доступов"
        aria-busy={manager.loading}
      >
        {manager.loading && (
          <p role="status" className={styles.muted}>
            Загрузка доступов…
          </p>
        )}
        {!manager.loading &&
          !manager.loadError &&
          manager.tokens.length === 0 && (
            <UiSurface className={styles.section}>
              <h2>Доступов пока нет</h2>
              <p className={styles.intro}>
                Создайте токен для инструмента или подключите CLI командой
                login. Подключение появится здесь после вашего подтверждения.
              </p>
            </UiSurface>
          )}
        {manager.tokens.map((token) => (
          <AccessTokenCard
            key={token.id}
            token={token}
            scopes={manager.context?.scopes ?? []}
            busy={manager.busy || manager.loading}
            onRevoke={manager.chooseRevoke}
          />
        ))}
        {manager.nextCursor && (
          <UiButton
            variant="secondary"
            disabled={manager.loading || manager.busy}
            onClick={() => {
              void manager.loadMore();
            }}
          >
            Загрузить ещё
          </UiButton>
        )}
      </section>
      <div className={styles.infoGrid}>
        <UiSurface className={styles.section}>
          <h2>Подключение CLI</h2>
          <p className={styles.intro}>
            Выполните команду в проекте, затем подтвердите показанный код в
            браузере.
          </p>
          <code className={styles.command}>{cliLoginCommand}</code>
          <a href={SYSTEM_ACCESS_DEVICE_ROUTE}>Ввести код CLI</a>
        </UiSurface>
        <UiSurface className={styles.section}>
          <h2>Клиенты MCP</h2>
          <p className={styles.intro}>
            Доступы к MCP-серверам управляются отдельно, в настройках
            соответствующего сервера.
          </p>
          <Link href="/admin/mcp-servers" prefetch={false}>
            Открыть MCP-серверы
          </Link>
        </UiSurface>
      </div>
      {manager.createOpen && (
        <AccessCreateDialog
          open
          mode={mode}
          scopes={manager.context?.scopes ?? []}
          busy={manager.busy}
          error={manager.commandError}
          onClose={manager.closeCreate}
          onCreate={manager.create}
        />
      )}
      {manager.created && (
        <AccessSecretDialog
          key={manager.created.token.id}
          created={manager.created}
          mode={mode}
          onForget={manager.forgetSecret}
        />
      )}
      <UiConfirmation
        open={Boolean(manager.revokeTarget)}
        mode={mode}
        onOpenChange={(open) => {
          if (!open) manager.chooseRevoke(null);
        }}
        title="Отозвать доступ?"
        subject={manager.revokeTarget?.name ?? ""}
        description="Следующий запрос с этим токеном будет отклонён. Для CLI также прекратится обновление авторизации; потребуется новый вход."
        confirmLabel="Отозвать"
        tone="danger"
        pending={manager.busy}
        error={manager.commandError ?? undefined}
        onConfirm={() => {
          void manager.revoke();
        }}
      />
    </div>
  );
}
