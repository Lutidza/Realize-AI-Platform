/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpServerDetail.component.tsx
 * @version 1.2.0
 * @date 2026-09-25
 * @description Связывает сохранённое состояние MCP, независимый черновик и команды управления.
 */
"use client";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@payloadcms/ui";
import type {
  McpAuditListDto,
  McpOneTimeTokenDto,
  McpProbeResultDto,
  McpServerDetailDto,
  McpServerMutationDto,
} from "@realize/ai-contracts";
import { UiButton, UiNotice, UiSurface } from "@realize/ui-kit";
import type { McpCatalog } from "./McpServersClient.types";
import type { McpServersViewData } from "./McpServersView.types";
import { McpServerForm } from "./McpServerForm.component";
import { McpServerStatus } from "./McpServerStatus.component";
import { McpClients } from "./McpClients.component";
import { McpChatGptConnection } from "./McpChatGptConnection.component";
import { useMcpRequest } from "./useMcpRequest.hook";
import styles from "./McpServers.module.css";

export function McpServerDetail({
  managementAPIURL,
  catalogURL,
  serverID,
}: McpServersViewData) {
  const { request, busy, error } = useMcpRequest(managementAPIURL);
  const path = `/${encodeURIComponent(serverID!)}`;
  const [server, setServer] = useState<McpServerDetailDto>();
  const [editing, setEditing] = useState<McpServerDetailDto>();
  const [catalog, setCatalog] = useState<McpCatalog>();
  const [history, setHistory] = useState<McpAuditListDto>();
  const [probe, setProbe] = useState<McpProbeResultDto>();
  const [formKey, setFormKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [chatgptDirty, setChatgptDirty] = useState(false);
  const reload = useCallback(async () => {
    const result = await request<McpServerDetailDto>(path);
    if (!result) return;
    if (result) {
      setServer(result);
      setEditing((previous) => previous ?? result);
    }
    const catalogResult = await request<McpCatalog>("/catalog");
    if (catalogResult) setCatalog(catalogResult);
    const events = await request<McpAuditListDto>(`${path}/history`);
    if (events) setHistory(events);
  }, [request, path]);
  useEffect(() => {
    // Начальная загрузка authenticated DTO; busy принадлежит жизненному циклу сетевого запроса.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  const accept = (result: McpServerMutationDto) => {
    setServer(result.server);
    setEditing(result.server);
    setFormKey((key) => key + 1);
    setDirty(false);
    setChatgptDirty(false);
  };
  const action = async (kind: "enabled" | "apply" | "test" | "discover") => {
    if (!server) return;
    const input = {
      expectedRevision: server.desiredRevision,
      ...(kind === "enabled" ? { enabled: !server.enabled } : {}),
    };
    if (kind === "test" || kind === "discover") {
      const result = await request<McpProbeResultDto>(`${path}/${kind}`, input);
      if (!result) return;
      setProbe(result);
    } else {
      const result = await request<McpServerMutationDto>(
        `${path}/${kind}`,
        input,
      );
      if (!result) return;
      accept(result);
    }
    await reload();
  };
  return (
    <>
      <header className={styles.row}>
        <h1>{server?.displayName ?? "MCP-сервер"}</h1>
        <Link href={catalogURL}>Все MCP-серверы</Link>
        <UiButton
          variant="secondary"
          disabled={busy}
          onClick={() => void reload()}
        >
          Обновить состояние
        </UiButton>
      </header>
      {error && (
        <UiNotice tone="danger" role="alert">
          {error}
        </UiNotice>
      )}
      {!server || !editing || !catalog ? (
        <p role="status">Загрузка настроек…</p>
      ) : (
        <>
          <UiSurface className={styles.section}>
            <McpServerStatus server={server} />
            <div className={styles.row}>
              {(
                [
                  [
                    "enabled",
                    server.enabled ? "Выключить доступ" : "Включить доступ",
                    "enable",
                  ],
                  ["apply", "Применить настройки", "apply"],
                  ["test", "Проверить подключение", "test"],
                  ["discover", "Обновить инструменты", "discover"],
                ] as const
              ).map(([kind, label, permission]) => (
                <UiButton
                  key={kind}
                  variant="secondary"
                  title={server.actions[permission].reason ?? undefined}
                  disabled={
                    busy ||
                    dirty ||
                    chatgptDirty ||
                    !server.actions[permission].allowed
                  }
                  onClick={() => void action(kind)}
                >
                  {label}
                </UiButton>
              ))}
            </div>
            {server.actions.apply.reason && (
              <p>{server.actions.apply.reason}</p>
            )}
            {server.configuration.serverType === "realize-internal" && (
              <p>
                Адрес на машине профиля:{" "}
                <code>http://127.0.0.1:{server.configuration.port}/mcp</code>.
                Процесс запускает оператор установки.
              </p>
            )}
            {probe && (
              <UiNotice
                tone={probe.status === "passed" ? "neutral" : "danger"}
                role="status"
              >
                {probe.message} ·{" "}
                {new Date(probe.checkedAt).toLocaleString("ru")}
              </UiNotice>
            )}
            <details className={styles.details}>
              <summary>Диагностика применения</summary>
              <p>
                Сохранена версия {server.desiredRevision}; подтверждена{" "}
                {server.observed.appliedRevision ?? "—"}.
              </p>
              <p>ID экземпляра: {server.serverID}</p>
              <p>
                Конфигурация:{" "}
                {server.observed.configHash ?? "нет подтверждения"}
              </p>
              <p>
                Последнее подтверждение:{" "}
                {server.observed.observedAt ?? "не получено"}
              </p>
            </details>
          </UiSurface>
          {server.desiredRevision !== editing.desiredRevision && (
            <UiNotice>
              Сохранённые настройки изменились. Введённые значения сохранены в
              форме. Загрузите актуальную версию перед новым сохранением.
            </UiNotice>
          )}
          <div className={styles.row}>
            <UiButton
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setEditing(server);
                setFormKey((key) => key + 1);
                setDirty(false);
              }}
            >
              Загрузить сохранённые настройки в форму
            </UiButton>
          </div>
          <McpServerForm
            key={formKey}
            existing
            initial={{
              displayName: editing.displayName,
              configuration: editing.configuration,
            }}
            profiles={catalog.profiles}
            busy={busy || chatgptDirty}
            onDirtyChange={setDirty}
            onSave={async (input) => {
              const result = await request<McpServerMutationDto>(path, {
                ...input,
                expectedRevision: editing.desiredRevision,
              });
              if (result) {
                accept(result);
                await reload();
              }
            }}
          />
          {server.configuration.serverType === "realize-internal" && (
            <McpClients
              server={server}
              busy={busy || dirty || chatgptDirty}
              issue={async (input) => {
                const result = await request<McpOneTimeTokenDto>(
                  `${path}/clients`,
                  input,
                );
                if (result) await reload();
                return result;
              }}
              change={async (id, kind) => {
                const result = await request<McpOneTimeTokenDto>(
                  `${path}/clients/${encodeURIComponent(id)}/${kind}`,
                  { expectedRevision: server.desiredRevision },
                );
                if (result) await reload();
                return result;
              }}
            />
          )}
          <McpChatGptConnection
            key={`chatgpt-${formKey}`}
            server={server}
            busy={busy || dirty}
            onDirtyChange={setChatgptDirty}
            onSave={async (input) => {
              const result = await request<McpServerMutationDto>(
                `${path}/chatgpt`,
                input,
              );
              if (result) {
                accept(result);
                await reload();
              }
            }}
            onDisconnect={async () => {
              const result = await request<McpServerMutationDto>(
                `${path}/chatgpt/disconnect`,
                { expectedRevision: server.desiredRevision },
              );
              if (result) {
                accept(result);
                await reload();
              }
            }}
          />
          <UiSurface asChild>
            <section className={styles.section}>
              <h2>Найденные инструменты</h2>
              {!server.discoveredTools.length ? (
                <p>
                  Список ещё не получен. Используйте «Обновить инструменты».
                </p>
              ) : (
                server.discoveredTools.map((tool) => (
                  <details key={tool.name} className={styles.details}>
                    <summary>
                      {tool.name} ·{" "}
                      {tool.approved ? "разрешён настройками" : "не разрешён"}
                    </summary>
                    <p>{tool.description}</p>
                    <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                  </details>
                ))
              )}
            </section>
          </UiSurface>
          <UiSurface asChild>
            <section className={styles.section}>
              <h2>История изменений</h2>
              {!history?.items.length ? (
                <p>История пуста.</p>
              ) : (
                history.items.map((event) => (
                  <p key={event.id}>
                    {new Date(event.createdAt).toLocaleString("ru")} ·{" "}
                    {event.summary} ·{" "}
                    {event.status === "passed" ? "выполнено" : "ошибка"}
                  </p>
                ))
              )}
              {history && history.totalPages > 1 && (
                <nav className={styles.row} aria-label="Страницы истории">
                  <UiButton
                    disabled={busy || history.page <= 1}
                    onClick={() => {
                      void request<McpAuditListDto>(
                        `${path}/history?page=${history.page - 1}`,
                      ).then((result) => {
                        if (result) setHistory(result);
                      });
                    }}
                  >
                    Ранее на странице
                  </UiButton>
                  <span>
                    {history.page} / {history.totalPages}
                  </span>
                  <UiButton
                    disabled={busy || history.page >= history.totalPages}
                    onClick={() => {
                      void request<McpAuditListDto>(
                        `${path}/history?page=${history.page + 1}`,
                      ).then((result) => {
                        if (result) setHistory(result);
                      });
                    }}
                  >
                    Более ранние события
                  </UiButton>
                </nav>
              )}
            </section>
          </UiSurface>
        </>
      )}
    </>
  );
}
