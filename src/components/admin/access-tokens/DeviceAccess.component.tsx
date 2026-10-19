/**
 * @file src/components/admin/access-tokens/DeviceAccess.component.tsx
 * @version 1.0.0
 * @date 2026-10-19
 * @description Показывает сверку human code, права и явное подтверждение подключения CLI.
 * @see documentation/architecture/platform-access.md
 */
"use client";
import {
  UiBadge,
  UiButton,
  UiInput,
  UiNotice,
  UiSurface,
  UiSwitch,
} from "@realize/ui-kit";
import type { SystemAdminContext } from "../system-shell/systemAdmin.types";
import { SYSTEM_ACCESS_ROUTE } from "../system-shell/systemAdmin.routes";
import { AccessShell } from "./AccessShell.component";
import { useDeviceAccess } from "./useDeviceAccess.hook";
import { formatAccessDate } from "./formatAccessDate.util";
import styles from "./AccessTokens.module.css";

/** Подтверждение возможно только после чтения запроса и ручной сверки кода. */
export function DeviceAccess(props: SystemAdminContext) {
  const device = useDeviceAccess();
  const request = device.request;
  const isPending = request?.status === "pending" && !device.expired;
  return (
    <AccessShell context={props} title="Подключение CLI">
      <div className={`${styles.workbench} ${styles.device}`}>
        <header className={styles.header}>
          <div>
            <h1>Подключение CLI</h1>
            <p className={styles.intro}>
              Введите код из команды login, проверьте имя инструмента и
              разрешения. Подключение появится только после вашего
              подтверждения.
            </p>
          </div>
        </header>
        <UiSurface className={styles.section}>
          <form
            className={styles.stack}
            onSubmit={(event) => {
              event.preventDefault();
              void device.lookup();
            }}
          >
            <label className={styles.field}>
              Код из CLI
              <UiInput
                className={styles.codeInput}
                value={device.code}
                onChange={(event) => device.changeCode(event.target.value)}
                placeholder="ABCD-EFGH"
                maxLength={9}
                required
                pattern="[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={device.busy}
                aria-describedby="device-code-help"
              />
            </label>
            <p id="device-code-help" className={styles.intro}>
              Код действует 10 минут. Подтверждайте только тот вход, который вы
              запустили сами.
            </p>
            <div className={styles.actions}>
              <UiButton type="submit" disabled={device.busy || !device.context}>
                {device.busy ? "Проверка…" : "Проверить код"}
              </UiButton>
            </div>
          </form>
        </UiSurface>
        {device.error && (
          <UiNotice role="alert" tone="danger">
            {device.error}
          </UiNotice>
        )}
        {request && (
          <UiSurface className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>{request.clientName}</h2>
              <UiBadge
                tone={
                  isPending
                    ? "neutral"
                    : request.status === "approved" ||
                        request.status === "consumed"
                      ? "positive"
                      : "danger"
                }
              >
                {isPending
                  ? "Ожидает решения"
                  : device.expired && request.status === "pending"
                    ? "Истёк"
                    : {
                        pending: "Ожидает решения",
                        approved: "Разрешено",
                        denied: "Отклонено",
                        consumed: "Подключено",
                        cancelled: "Отменено",
                        expired: "Истёк",
                      }[request.status]}
              </UiBadge>
            </div>
            <dl className={styles.metadata}>
              <div>
                <dt>Код запроса</dt>
                <dd className={styles.userCode}>{request.userCode}</dd>
              </div>
              <div>
                <dt>Пользователь</dt>
                <dd>{device.context?.actor.name}</dd>
              </div>
              <div>
                <dt>Подтвердить до</dt>
                <dd>
                  <time dateTime={request.expiresAt}>
                    {formatAccessDate(request.expiresAt)}
                  </time>
                </dd>
              </div>
            </dl>
            <div className={styles.stackSmall}>
              <h3>Запрошенные разрешения</h3>
              <ul className={styles.scopeList}>
                {request.scopes.map((scope) => {
                  const description = device.context?.scopes.find(
                    (entry) => entry.id === scope,
                  );
                  return (
                    <li key={scope}>
                      <strong>{description?.label ?? scope}</strong>
                      <span className={styles.help}>
                        {description?.description}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            {isPending ? (
              <>
                <p className={styles.intro}>
                  CLI получит доступ от вашего имени на срок до 90 дней. Его
                  можно отозвать в центре доступов.
                </p>
                <label className={styles.scopeField}>
                  <UiSwitch
                    checked={device.matched}
                    onChange={(event) =>
                      device.setMatched(event.target.checked)
                    }
                    disabled={device.busy}
                  />
                  <span>Код совпадает с показанным в моём CLI</span>
                </label>
                <div className={styles.actions}>
                  <UiButton
                    disabled={device.busy || !device.matched}
                    onClick={() => {
                      void device.decide("approve");
                    }}
                  >
                    Разрешить подключение
                  </UiButton>
                  <UiButton
                    variant="secondary"
                    disabled={device.busy}
                    onClick={() => {
                      void device.decide("deny");
                    }}
                  >
                    Отклонить подключение
                  </UiButton>
                </div>
              </>
            ) : (
              <UiNotice
                role="status"
                tone={
                  request.status === "approved" || request.status === "consumed"
                    ? "positive"
                    : "neutral"
                }
              >
                {request.status === "approved" || request.status === "consumed"
                  ? "Подключение разрешено. Вернитесь в CLI, чтобы завершить вход."
                  : request.status === "denied"
                    ? "Подключение отклонено. CLI не получит доступ."
                    : "Запрос больше не действует. При необходимости запустите login в CLI заново."}
              </UiNotice>
            )}
          </UiSurface>
        )}
        <a href={SYSTEM_ACCESS_ROUTE}>Вернуться к доступам и токенам</a>
      </div>
    </AccessShell>
  );
}
