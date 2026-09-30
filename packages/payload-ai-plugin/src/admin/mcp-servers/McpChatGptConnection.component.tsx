/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpChatGptConnection.component.tsx
 * @version 1.2.0
 * @date 2026-09-26
 * @description Настраивает ChatGPT в Admin через write-only ключ, права и безопасный статус.
 * @see documentation/architecture/mcp-tooling.md
 */
"use client";
import { UiButton, UiInput, UiNotice, UiSurface } from "@realize/ui-kit";
import type { McpChatGptConnectionProps } from "./McpServersClient.types";
import { useMcpChatGptForm } from "./useMcpChatGptForm.hook";
import { McpGrantFields } from "./McpGrantFields.component";
import styles from "./McpServers.module.css";

const statusLabels = {
  not_configured: "Не настроено",
  disabled: "MCP-сервер выключен",
  pending: "Ожидает применения",
  starting: "Подключается",
  connected: "Туннель готов",
  failed: "Подключение не готово: проверьте ключ, права OpenAI и срок доступа",
  stale: "Нет свежего подтверждения от процесса",
};

/** Готовность tunnel не подменяет отдельную проверку tool call из ChatGPT. */
export function McpChatGptConnection(props: McpChatGptConnectionProps) {
  const { server, busy, onDisconnect } = props;
  const { draft, setDraft, dirty, save } = useMcpChatGptForm(props);
  const connection = server.chatgpt;
  if (!connection) return null;
  return (
    <UiSurface asChild>
      <section className={styles.section} aria-label="Подключение ChatGPT">
        <h2>Подключение ChatGPT</h2>
        <p>
          Подключите этот MCP-сервер к обычному чату ChatGPT через Secure MCP
          Tunnel.
        </p>
        <p role="status">Состояние: {statusLabels[connection.status]}</p>
        {connection.observedAt && (
          <p>
            Проверено: {new Date(connection.observedAt).toLocaleString("ru")}.
            Для нового результата нажмите «Обновить состояние».
          </p>
        )}
        {connection.actions.configure.reason && (
          <UiNotice>{connection.actions.configure.reason}</UiNotice>
        )}
        {!server.enabled && (
          <UiNotice>
            Сначала нажмите «Включить доступ» для этого сервера.
          </UiNotice>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset
            className={styles.stack}
            disabled={busy || !connection.actions.configure.allowed}
          >
            <div className={styles.grid}>
              <label className={styles.field}>
                Tunnel ID
                <UiInput
                  required
                  autoComplete="off"
                  placeholder="tunnel_…"
                  maxLength={135}
                  pattern={"tunnel_[A-Za-z0-9_\\-]{8,128}"}
                  value={draft.tunnelID}
                  onChange={(event) =>
                    setDraft({ ...draft, tunnelID: event.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                Ключ OpenAI для туннеля
                <UiInput
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  required={!connection.hasApiKey}
                  maxLength={2048}
                  value={draft.apiKey}
                  placeholder={
                    connection.hasApiKey
                      ? "Ключ сохранён; оставьте пустым, чтобы сохранить его"
                      : "Вставьте ключ с правами Tunnels Read + Use"
                  }
                  onChange={(event) =>
                    setDraft({ ...draft, apiKey: event.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                Доступ ChatGPT к MCP до
                <UiInput
                  required
                  type="date"
                  value={draft.expires}
                  onChange={(event) =>
                    setDraft({ ...draft, expires: event.target.value })
                  }
                />
              </label>
            </div>
            <p>
              {connection.hasApiKey
                ? "Ключ сохранён в зашифрованном хранилище."
                : "Ключ будет сохранён в зашифрованном хранилище этой установки."}{" "}
              Сохранённое значение не отображается.
            </p>
            <McpGrantFields
              value={draft.grants}
              allowed={server.clientGrantOptions}
              onChange={(grants) => setDraft({ ...draft, grants })}
            />
            <p>
              Участники, допущенные к туннелю в OpenAI, получат выбранные права
              MCP. Срок выше относится к локальному доступу; срок ключа OpenAI
              задаётся в OpenAI Platform.
            </p>
            {dirty && (
              <UiNotice role="status">
                Настройки ChatGPT ещё не сохранены.
              </UiNotice>
            )}
            <UiButton
              type="submit"
              disabled={
                !server.enabled ||
                (!draft.grants.repositoryRead &&
                  !draft.grants.pagesRead &&
                  !draft.grants.workshopRead)
              }
            >
              {busy ? "Сохранение…" : "Сохранить и подключить ChatGPT"}
            </UiButton>
          </fieldset>
        </form>
        <div className={styles.row}>
          <UiButton
            variant="secondary"
            disabled={busy || !connection.actions.disconnect.allowed}
            onClick={() => void onDisconnect()}
          >
            Отключить ChatGPT и удалить ключ
          </UiButton>
        </div>
        <p>
          Создайте туннель и разрешите доступ своему workspace в{" "}
          <a
            href="https://platform.openai.com/settings/organization/tunnels"
            target="_blank"
            rel="noreferrer"
          >
            OpenAI Platform
          </a>
          . После готовности туннеля добавьте приложение в{" "}
          <a
            href="https://chatgpt.com/plugins"
            target="_blank"
            rel="noreferrer"
          >
            ChatGPT
          </a>
          , выбрав Connection → Tunnel.
        </p>
        <p>
          Проверка в ChatGPT: «Вызови ai_capabilities_list, затем
          realize_get_context и прочитай README.md через repo_read_file».
        </p>
        <a
          href="https://developers.openai.com/api/docs/guides/secure-mcp-tunnels"
          target="_blank"
          rel="noreferrer"
        >
          Инструкция Secure MCP Tunnel
        </a>
      </section>
    </UiSurface>
  );
}
