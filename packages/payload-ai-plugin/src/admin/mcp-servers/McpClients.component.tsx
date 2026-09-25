/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpClients.component.tsx
 * @version 1.1.0
 * @date 2026-09-25
 * @description Управляет входящими ключами MCP и однократным показом нового секрета.
 */
"use client";
import { useState } from "react";
import type {
  IssueMcpClientInput,
  McpServerDetailDto,
  McpOneTimeTokenDto,
  McpServerMutationDto,
} from "@realize/ai-contracts";
import {
  UiButton,
  UiInput,
  UiNotice,
  UiSurface,
  UiTextarea,
} from "@realize/ui-kit";
import { McpReadGrantFields } from "./McpReadGrantFields.component";
import styles from "./McpServers.module.css";

export function McpClients({
  server,
  busy,
  issue,
  change,
}: {
  server: McpServerDetailDto;
  busy: boolean;
  issue: (
    input: IssueMcpClientInput,
  ) => Promise<McpOneTimeTokenDto | undefined>;
  change: (
    clientID: string,
    action: "rotate" | "revoke",
  ) => Promise<McpOneTimeTokenDto | McpServerMutationDto | undefined>;
}) {
  const [name, setName] = useState("");
  const [repositoryRead, setRepositoryRead] = useState(false);
  const [pagesRead, setPagesRead] = useState(false);
  const [expires, setExpires] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [observedAt] = useState(() => Date.now());
  const accept = (
    result: McpOneTimeTokenDto | McpServerMutationDto | undefined,
  ) => {
    if (!result) return;
    if ("server" in result) {
      setToken(null);
      setNotice("Ключ отозван; новые вызовы запрещены.");
      return;
    }
    setToken(result.token);
    setNotice(
      result.token
        ? "Сохраните ключ: повторно увидеть его нельзя. Новый ключ начнёт работать после применения настроек."
        : result.replayed
          ? "Операция уже выполнена. Для получения нового ключа используйте перевыпуск."
          : "Ключ отозван; новые вызовы запрещены.",
    );
  };
  return (
    <UiSurface asChild>
      <section className={styles.section} aria-label="Клиенты MCP">
        <h2>Клиенты и ключи</h2>
        {notice && <UiNotice role="status">{notice}</UiNotice>}
        {token && (
          <div className={styles.stack}>
            <label className={styles.field}>
              Новый ключ
              <UiTextarea
                aria-label="Новый ключ"
                readOnly
                value={token}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className={styles.row}>
              <UiButton
                onClick={() => {
                  void navigator.clipboard.writeText(token).then(
                    () =>
                      setNotice(
                        "Ключ скопирован. Сохраните его в защищённом хранилище.",
                      ),
                    () =>
                      setNotice(
                        "Копирование недоступно. Выделите ключ и скопируйте вручную.",
                      ),
                  );
                }}
              >
                Копировать ключ
              </UiButton>
              <UiButton
                variant="secondary"
                onClick={() => {
                  setToken(null);
                  setNotice(null);
                }}
              >
                Скрыть ключ
              </UiButton>
            </div>
          </div>
        )}
        {!server.clients.length && <p>Клиенты ещё не добавлены.</p>}
        {server.clients.map((client) => (
          <UiSurface
            key={client.clientID}
            tone="raised"
            className={styles.section}
          >
            <h3>{client.displayName}</h3>
            <p>
              {client.revokedAt
                ? "Отозван"
                : Date.parse(client.expiresAt) <= observedAt
                  ? "Истёк"
                  : "Выдан"}{" "}
              · до {new Date(client.expiresAt).toLocaleString("ru")}
            </p>
            <p>
              {[
                client.grants.repositoryRead && "Репозиторий",
                client.grants.pagesRead && "Страницы с вашими текущими правами",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className={styles.row}>
              <UiButton
                disabled={busy || !client.actions.rotate.allowed}
                title={client.actions.rotate.reason ?? undefined}
                variant="secondary"
                onClick={() => {
                  setToken(null);
                  void change(client.clientID, "rotate").then(accept);
                }}
              >
                Перевыпустить
              </UiButton>
              <UiButton
                disabled={busy || !client.actions.revoke.allowed}
                title={client.actions.revoke.reason ?? undefined}
                variant="secondary"
                onClick={() => {
                  setToken(null);
                  void change(client.clientID, "revoke").then(accept);
                }}
              >
                Отозвать
              </UiButton>
            </div>
          </UiSurface>
        ))}
        {!server.actions.issueClient.allowed && (
          <p>{server.actions.issueClient.reason}</p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setToken(null);
            void issue({
              expectedRevision: server.desiredRevision,
              displayName: name,
              grants: { repositoryRead, pagesRead },
              actorBinding: pagesRead ? "self" : "none",
              expiresAt: new Date(`${expires}T23:59:59Z`).toISOString(),
            }).then((result) => {
              accept(result);
              if (result) setName("");
            });
          }}
        >
          <fieldset
            disabled={busy || !server.actions.issueClient.allowed}
            className={styles.stack}
          >
            <div className={styles.grid}>
              <label className={styles.field}>
                Название клиента
                <UiInput
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                Срок действия
                <UiInput
                  required
                  type="date"
                  value={expires}
                  min={new Date(observedAt).toISOString().slice(0, 10)}
                  max={new Date(observedAt + 365 * 86400000)
                    .toISOString()
                    .slice(0, 10)}
                  onChange={(event) => setExpires(event.target.value)}
                />
              </label>
            </div>
            <McpReadGrantFields
              value={{ repositoryRead, pagesRead }}
              allowed={server.clientGrantOptions}
              onChange={(value) => {
                setRepositoryRead(value.repositoryRead);
                setPagesRead(value.pagesRead);
              }}
            />
            <p>
              Доступ к репозиторию разрешает оператор для этого экземпляра.
              Права на страницы проверяются при каждом вызове.
            </p>
            <UiButton type="submit" disabled={!repositoryRead && !pagesRead}>
              Выдать ключ
            </UiButton>
          </fieldset>
        </form>
      </section>
    </UiSurface>
  );
}
