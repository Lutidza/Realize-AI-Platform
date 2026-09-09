/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexAccountAccess.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Представляет вход аккаунта ChatGPT через браузер или код устройства.
 */

import { UiButton, UiNotice } from "@realize/ui-kit";
import { LoaderCircle, LogIn } from "lucide-react";
import type { CodexConnectionFieldsProps } from "./CodexConnectionFields.types";
import { CodexBrowserLogin } from "./CodexBrowserLogin.component";
import { CodexDeviceLogin } from "./CodexDeviceLogin.component";
import styles from "./CodexConnectionFields.module.css";
import actionStyles from "../IntegrationSettingsActions.module.css";

export const CodexAccountAccess = ({ form }: CodexConnectionFieldsProps) => {
  const login = form.operations.login;
  return (
    <>
      <p className={styles.accessCopy}>
        {form.hasMatchingCredential
          ? "Аккаунт сохранён. Новый вход заменит данные доступа только после успешного подтверждения."
          : "Войдите в аккаунт ChatGPT. После подтверждения подключение сохранится автоматически."}
      </p>
      {form.draft.loginMethod === "deviceCode" ? (
        <UiNotice title="Разрешите вход по коду устройства">
          В ChatGPT откройте настройки безопасности и включите авторизацию Codex
          с помощью кода устройства. Для рабочего пространства может
          потребоваться разрешение администратора.
        </UiNotice>
      ) : null}
      {login.session?.loginMethod === "browser" ? (
        <CodexBrowserLogin
          callbackURL={login.callbackURL}
          isBusy={login.isCancelling || login.isCompleting}
          onCallbackURLChange={login.setCallbackURL}
          onCancel={login.cancel}
          onComplete={login.complete}
          session={login.session}
        />
      ) : login.session?.loginMethod === "deviceCode" ? (
        <CodexDeviceLogin
          isCancelling={login.isCancelling}
          isCopied={login.isCopied}
          onCancel={login.cancel}
          onCopy={login.copy}
          session={login.session}
        />
      ) : (
        <UiButton
          aria-busy={login.isStarting}
          className={styles.loginButton}
          disabled={form.isDisabled}
          onClick={() => void form.startLogin()}
        >
          {login.isStarting ? (
            <LoaderCircle
              aria-hidden="true"
              className={actionStyles.spinner}
              size={18}
            />
          ) : (
            <LogIn aria-hidden="true" size={18} />
          )}
          {form.draft.loginMethod === "browser"
            ? "Начать вход через браузер"
            : "Получить код устройства"}
        </UiButton>
      )}
      <UiNotice title="Используются лимиты аккаунта">
        Доступ к Codex определяется планом ChatGPT. Автоматического переключения
        на платный API нет.
      </UiNotice>
    </>
  );
};
