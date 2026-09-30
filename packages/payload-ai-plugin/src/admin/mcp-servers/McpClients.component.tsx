/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpClients.component.tsx
 * @version 1.2.0
 * @date 2026-09-26
 * @description Управляет входящими ключами MCP и однократным показом нового секрета.
 */
"use client";
import { useState } from "react";
import type {
  IssueMcpClientInput,
  McpServerDetailDto,
  McpOneTimeTokenDto,
  McpServerMutationDto,
  McpClientGrants,
} from "@realize/ai-contracts";
import {
  UiButton,
  UiInput,
  UiNotice,
  UiSurface,
  UiTextarea,
} from "@realize/ui-kit";
import { McpGrantFields } from "./McpGrantFields.component";
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
  const [grants, setGrants] = useState<McpClientGrants>({
    repositoryRead: false,
    pagesRead: false,
    workshopRead: false,
    workshopWrite: false,
    workshopPreview: false,
  });
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
                client.grants.workshopRead && "Мастерская: чтение",
                client.grants.workshopWrite && "Мастерская: сохранение правок",
                client.grants.workshopPreview && "Мастерская: preview",
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
              grants,
              actorBinding:
                grants.pagesRead || grants.workshopRead ? "self" : "none",
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
            <McpGrantFields
              value={grants}
              allowed={server.clientGrantOptions}
              onChange={setGrants}
            />
            <p>
              Доступ к репозиторию разрешает оператор для этого экземпляра.
              Права на страницы и личные проекты Мастерской проверяются при
              каждом вызове.
            </p>
            <UiButton
              type="submit"
              disabled={
                !grants.repositoryRead &&
                !grants.pagesRead &&
                !grants.workshopRead
              }
            >
              Выдать ключ
            </UiButton>
          </fieldset>
        </form>
      </section>
    </UiSurface>
  );
}
