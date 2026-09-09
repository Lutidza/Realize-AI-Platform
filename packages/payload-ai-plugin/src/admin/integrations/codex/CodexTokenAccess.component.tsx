/**
 * @file packages/payload-ai-plugin/src/admin/integrations/codex/CodexTokenAccess.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Представляет защищённый ввод API key или токена рабочего пространства Codex.
 */

import { UiInput, UiNotice } from "@realize/ui-kit";
import { CheckCircle2 } from "lucide-react";
import type { CodexConnectionFieldsProps } from "./CodexConnectionFields.types";
import styles from "../IntegrationConnectionForm.module.css";

export const CodexTokenAccess = ({ form }: CodexConnectionFieldsProps) => {
  const isAPIKey = form.draft.authMode === "apiKey";
  const value = isAPIKey ? form.draft.apiKey : form.draft.accessToken;
  const label = isAPIKey ? "OpenAI API key" : "Codex access token";
  return (
    <>
      <label className={styles.field}>
        <span>{label}</span>
        <div className={styles.secretInputWrap}>
          <UiInput
            autoCapitalize="none"
            autoComplete="new-password"
            disabled={form.isDisabled}
            maxLength={4096}
            onChange={(event) =>
              isAPIKey
                ? form.onApiKeyChange(event.target.value)
                : form.onAccessTokenChange(event.target.value)
            }
            placeholder={
              form.hasMatchingCredential
                ? "Сохранён · введите только для замены"
                : isAPIKey
                  ? "sk-…"
                  : "Токен с доступом к Codex"
            }
            spellCheck={false}
            type="password"
            value={value}
          />
          {form.hasMatchingCredential && !value ? (
            <CheckCircle2 aria-label="Данные доступа сохранены" size={18} />
          ) : null}
        </div>
        <small>
          {form.hasMatchingCredential
            ? "Пустое поле сохраняет текущие данные доступа. Для замены введите новое значение."
            : "Значение будет зашифровано на сервере и не вернётся в форму."}
        </small>
      </label>
      <UiNotice
        title={
          isAPIKey
            ? "API оплачивается отдельно"
            : "Для ChatGPT Business и Enterprise"
        }
      >
        {isAPIKey
          ? "Создайте ключ в OpenAI Platform. Расход API оплачивается отдельно от подписки ChatGPT."
          : "Администратор рабочего пространства должен разрешить создание access tokens. Создайте токен с доступом к Codex; он использует права и лимиты рабочего пространства."}
      </UiNotice>
    </>
  );
};
