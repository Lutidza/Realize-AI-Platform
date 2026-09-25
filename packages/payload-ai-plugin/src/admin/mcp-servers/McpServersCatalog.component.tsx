/**
 * @file packages/payload-ai-plugin/src/admin/mcp-servers/McpServersCatalog.component.tsx
 * @version 1.1.0
 * @date 2026-09-24
 * @description Показывает сохраняемый каталог экземпляров MCP с фильтрами и созданием.
 */
"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@payloadcms/ui";
import {
  UiButton,
  UiInput,
  UiNotice,
  UiSelect,
  UiSurface,
} from "@realize/ui-kit";
import { MCP_DEFAULT_LIMITS, MCP_REALIZE_TOOLS } from "@realize/ai-contracts";
import type {
  CreateMcpServerInput,
  McpServerListDto,
  McpServerMutationDto,
  McpServerType,
} from "@realize/ai-contracts";
import type { McpServersViewData } from "./McpServersView.types";
import type { McpCatalog } from "./McpServersClient.types";
import { useMcpRequest } from "./useMcpRequest.hook";
import { McpServerStatus } from "./McpServerStatus.component";
import { McpServerForm } from "./McpServerForm.component";
import styles from "./McpServers.module.css";

export function McpServersCatalog({
  catalogURL,
  managementAPIURL,
}: McpServersViewData) {
  const router = useRouter();
  const { request, busy, error } = useMcpRequest(managementAPIURL);
  const [catalog, setCatalog] = useState<McpCatalog>();
  const [list, setList] = useState<McpServerListDto>();
  const [query, setQuery] = useState({
    q: "",
    serverType: "",
    environment: "",
    enabled: "",
    page: 1,
  });
  const [createType, setCreateType] = useState<McpServerType>();
  const reload = useCallback(async () => {
    const definitions = await request<McpCatalog>("/catalog");
    if (!definitions) return;
    if (definitions) setCatalog(definitions);
    const params = new URLSearchParams({
      page: String(query.page),
      limit: "25",
    });
    for (const key of ["q", "serverType", "environment", "enabled"] as const)
      if (query[key]) params.set(key, query[key]);
    const result = await request<McpServerListDto>(`?${params}`);
    if (result) setList(result);
  }, [request, query]);
  useEffect(() => {
    // Смена фильтра запрашивает новый DTO; busy принадлежит жизненному циклу сетевого запроса.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  const profile = catalog?.profiles[0];
  const initial: CreateMcpServerInput | undefined =
    createType && createType !== "mcp-http"
      ? {
          displayName: "",
          configuration:
            createType === "realize-internal"
              ? {
                  schemaVersion: "1.0",
                  adapterVersion: "1.0",
                  serverType: createType,
                  direction: "hosted_endpoint",
                  managementSource: "admin_managed",
                  environment: "development",
                  hostProfileID: profile?.id ?? "",
                  port: profile?.allowedPorts[0] ?? 3100,
                  allowedTools: [...MCP_REALIZE_TOOLS],
                  limits: { ...(profile?.maximumLimits ?? MCP_DEFAULT_LIMITS) },
                }
              : {
                  schemaVersion: "1.0",
                  adapterVersion: "1.0",
                  serverType: createType,
                  direction: "external_connection",
                  managementSource: "client_managed",
                  environment: "development",
                  profileReference: "",
                },
        }
      : undefined;
  return (
    <>
      <header className={styles.row}>
        <h1>MCP-серверы</h1>
        <UiButton
          variant="secondary"
          disabled={busy}
          onClick={() => void reload()}
        >
          Обновить
        </UiButton>
      </header>
      <p>
        Настройки серверов, доступ клиентов и подтверждение работающего
        процесса.
      </p>
      {catalog && (
        <UiSurface asChild>
          <section
            className={styles.section}
            aria-label="Предустановленные серверы"
          >
            <h2>Предустановлены в платформе</h2>
            <p>
              Готовые настройки серверов. Доступ клиентов включается отдельно.
            </p>
            {catalog.presets.map((preset) => (
              <p key={preset.id}>
                {preset.installed ? (
                  <Link href={`${catalogURL}/${preset.serverID}`}>
                    {preset.displayName}
                  </Link>
                ) : (
                  preset.displayName
                )}
                {preset.installed ? " · установлен" : " · ожидает установки"}
              </p>
            ))}
            {catalog.presets.some((preset) => !preset.installed) && (
              <UiButton
                disabled={busy}
                onClick={async () => {
                  if (await request("/install-defaults", {})) await reload();
                }}
              >
                Установить серверы по умолчанию
              </UiButton>
            )}
          </section>
        </UiSurface>
      )}
      {error && (
        <UiNotice tone="danger" role="alert">
          {error}
        </UiNotice>
      )}
      <form
        className={styles.grid}
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          setQuery({
            q: String(fields.get("q") ?? ""),
            serverType: String(fields.get("type") ?? ""),
            environment: String(fields.get("environment") ?? ""),
            enabled: String(fields.get("enabled") ?? ""),
            page: 1,
          });
        }}
      >
        <label className={styles.field}>
          Поиск по названию
          <UiInput name="q" maxLength={128} type="search" />
        </label>
        <label className={styles.field}>
          Тип
          <UiSelect name="type">
            <option value="">Все типы</option>
            {catalog?.descriptors.map((entry) => (
              <option key={entry.serverType} value={entry.serverType}>
                {entry.name}
              </option>
            ))}
          </UiSelect>
        </label>
        <label className={styles.field}>
          Окружение
          <UiInput name="environment" maxLength={120} />
        </label>
        <label className={styles.field}>
          Доступ
          <UiSelect name="enabled">
            <option value="">Любой</option>
            <option value="true">Включён</option>
            <option value="false">Выключен</option>
          </UiSelect>
        </label>
        <UiButton type="submit" disabled={busy}>
          Найти
        </UiButton>
      </form>
      <div className={styles.stack} aria-busy={busy}>
        {!list ? (
          <p role="status">Загрузка каталога…</p>
        ) : !list.items.length ? (
          <UiNotice>
            Серверы не найдены. Добавьте экземпляр или измените фильтры.
          </UiNotice>
        ) : (
          list.items.map((server) => (
            <UiSurface key={server.serverID} asChild>
              <article className={styles.section}>
                <h2>
                  <Link
                    href={`${catalogURL}/${encodeURIComponent(server.serverID)}`}
                  >
                    {server.displayName}
                  </Link>
                </h2>
                <p>
                  {server.serverType} · {server.environment} ·{" "}
                  {server.direction === "hosted_endpoint"
                    ? "Собственный endpoint"
                    : "Внешнее подключение"}
                </p>
                <McpServerStatus server={server} />
              </article>
            </UiSurface>
          ))
        )}
      </div>
      {list && list.totalPages > 1 && (
        <nav aria-label="Страницы серверов" className={styles.row}>
          <UiButton
            disabled={busy || query.page <= 1}
            onClick={() => setQuery({ ...query, page: query.page - 1 })}
          >
            Назад
          </UiButton>
          <span>
            {query.page} / {list.totalPages}
          </span>
          <UiButton
            disabled={busy || query.page >= list.totalPages}
            onClick={() => setQuery({ ...query, page: query.page + 1 })}
          >
            Далее
          </UiButton>
        </nav>
      )}
      <label className={styles.field}>
        Добавить экземпляр
        <UiSelect
          value={createType ?? ""}
          disabled={busy}
          onChange={(event) =>
            setCreateType((event.target.value as McpServerType) || undefined)
          }
        >
          <option value="">Выберите тип</option>
          {catalog?.descriptors.map((entry) => (
            <option key={entry.serverType} value={entry.serverType}>
              {entry.name}
              {entry.support === "metadata_only"
                ? " — учёт внешнего подключения"
                : ""}
            </option>
          ))}
        </UiSelect>
      </label>
      {initial && catalog && (
        <McpServerForm
          key={createType}
          initial={initial}
          busy={busy}
          profiles={catalog.profiles}
          onSave={async (input) => {
            const result = await request<McpServerMutationDto>("", input);
            if (result)
              router.push(
                `${catalogURL}/${encodeURIComponent(result.server.serverID)}`,
              );
          }}
        />
      )}
    </>
  );
}
