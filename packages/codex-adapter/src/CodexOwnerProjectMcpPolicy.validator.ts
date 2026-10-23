/**
 * @file packages/codex-adapter/src/CodexOwnerProjectMcpPolicy.validator.ts
 * @version 1.0.0
 * @date 2026-10-23
 * @description Проверяет происхождение owner MCP и фиксирует допущенные серверы одного запуска.
 */

import { join } from "node:path";
import { codexRecord as asRecord } from "./codexRecord.util";

const SERVER_NAME = /^[A-Za-z0-9_-]{1,128}$/;
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;

const invalid = (): never => {
  throw new Error(
    "Не удалось подтвердить проектную конфигурацию MCP владельца.",
  );
};

/** Пути явно заданных значений совпадают с ключами origins в config/read. */
const leafPaths = (value: unknown, prefix: string): string[] => {
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    // Codex не создаёт origins для пустых массивов/таблиц; их задаёт raw project layer.
    return entries.flatMap(([key, child]) =>
      leafPaths(child, `${prefix}.${key}`),
    );
  }
  return [prefix];
};

/** Допуск принадлежит одному config/read; raw конфигурация никогда не попадает в события. */
export class CodexOwnerProjectMcpPolicy {
  readonly config: Record<string, unknown>;
  private readonly servers = new Map<string, Record<string, unknown>>();

  constructor(
    response: unknown,
    workspaceRoot: string,
    trustedProjectMcp: boolean,
  ) {
    const result = asRecord(response) ?? invalid();
    const config = asRecord(result.config) ?? invalid();
    const origins = asRecord(result.origins) ?? invalid();
    const layers = Array.isArray(result.layers) ? result.layers : invalid();
    const servers =
      config.mcp_servers === undefined
        ? {}
        : (asRecord(config.mcp_servers) ?? invalid());
    if (Object.keys(servers).length > 64) invalid();
    const projectFolder = join(workspaceRoot, ".codex");
    const layer = layers.map(asRecord).find((entry) => {
      const name = asRecord(entry?.name);
      return (
        name?.type === "project" &&
        name.dotCodexFolder === projectFolder &&
        !entry?.disabledReason
      );
    });
    const projectServers = asRecord(asRecord(layer?.config)?.mcp_servers);
    const pinned: Record<string, unknown> = Object.create(null);
    for (const [name, value] of Object.entries(servers)) {
      if (!SERVER_NAME.test(name)) invalid();
      const server = asRecord(value) ?? invalid();
      if (server.enabled !== undefined && typeof server.enabled !== "boolean")
        invalid();
      if (!trustedProjectMcp || server.enabled === false) {
        pinned[name] = { enabled: false };
        continue;
      }
      const declared =
        (projectServers && Object.hasOwn(projectServers, name)
          ? asRecord(projectServers[name])
          : undefined) ?? invalid();
      const version =
        typeof layer?.version === "string" ? layer.version : invalid();
      const prefix = `mcp_servers.${name}.`;
      // Effective config содержит вычисленные defaults без origins; копируем только raw project config.
      // Любой явно заданный effective leaf всё равно обязан принадлежать этому project layer.
      const paths = new Set([
        ...leafPaths(declared, `mcp_servers.${name}`),
        ...Object.keys(origins).filter((path) => path.startsWith(prefix)),
      ]);
      for (const path of paths) {
        const origin = asRecord(origins[path]);
        const source = asRecord(origin?.name);
        if (
          source?.type !== "project" ||
          source.dotCodexFolder !== projectFolder ||
          origin?.version !== version
        )
          invalid();
      }
      for (const field of ["enabled_tools", "disabled_tools"]) {
        const names = declared[field];
        if (
          names !== undefined &&
          (!Array.isArray(names) ||
            names.length > 512 ||
            names.some(
              (tool) => typeof tool !== "string" || !TOOL_NAME.test(tool),
            ))
        )
          invalid();
      }
      this.servers.set(name, structuredClone(declared));
      pinned[name] = structuredClone(declared);
    }
    // Пустая mcp_servers={} сливается с нижними слоями, поэтому запрет задаётся по имени.
    this.config = { mcp_servers: pinned };
  }

  /** Имена берутся из доверенного project config, ограничения tools сохраняет сам сервер. */
  allows(item: Record<string, unknown>): boolean {
    if (
      typeof item.server !== "string" ||
      typeof item.tool !== "string" ||
      !TOOL_NAME.test(item.tool) ||
      item.appContext != null ||
      item.pluginId != null
    )
      return false;
    const server = this.servers.get(item.server);
    return Boolean(
      server &&
      (!Array.isArray(server.enabled_tools) ||
        server.enabled_tools.includes(item.tool)) &&
      (!Array.isArray(server.disabled_tools) ||
        !server.disabled_tools.includes(item.tool)),
    );
  }

  /** В диагностику выходят только ограниченные имена, без arguments, результатов и auth. */
  static label(item: Record<string, unknown>): string {
    const server =
      typeof item.server === "string" && SERVER_NAME.test(item.server)
        ? item.server
        : "неизвестный-сервер";
    const tool =
      typeof item.tool === "string" && TOOL_NAME.test(item.tool)
        ? item.tool
        : "неизвестный-инструмент";
    return `${server}/${tool}`;
  }
}
