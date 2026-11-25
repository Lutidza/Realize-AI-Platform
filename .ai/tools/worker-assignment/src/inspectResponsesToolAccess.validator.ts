/**
 * @file .ai/tools/worker-assignment/src/inspectResponsesToolAccess.validator.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Сверяет прямые объявления Responses с маршрутами ToolRouter для диагностики назначения.
 */
import { inspectResponsesToolCatalog } from "./inspectResponsesToolCatalog.validator";
import { readToolNamespacesInfo } from "./readToolNamespacesInfo.mapper";

const searchName = "tool_search.tool_search_tool";
function directName(name: string, type: string | null) {
  if (type === "tool_search") return searchName;
  return name.includes(".") ? name : "functions." + name;
}

/** Подтверждение требует единственного прямого MCP-reader с закреплённым enum и согласованных маршрутов. */
export function inspectResponsesToolAccess(
  body: unknown,
  paths: readonly string[],
) {
  const catalog = inspectResponsesToolCatalog(body, paths);
  const metadata = readToolNamespacesInfo(body);
  const routes = metadata.routes ?? [];
  const direct = new Map<string, string | null>();
  for (const tool of catalog.tools) {
    // Codex исключает hosted web_search из tool_namespaces_info, но учитываем его в проверке onlyReader.
    if (tool.name !== null && tool.type !== "web_search")
      direct.set(directName(tool.name, tool.type), tool.type);
  }
  const declared = new Set(
    routes.filter((route) => route.direct).map((route) => route.name),
  );
  const onlyInCatalog = metadata.reason
    ? []
    : [...direct.keys()].filter((name) => !declared.has(name));
  const onlyInMetadata = [...declared].filter((name) => !direct.has(name));
  const hasGateway = (name: string, type: string) =>
    direct.get(name) === type &&
    routes.some(
      (r) => r.name === name && r.direct && r.source.kind === "harness",
    );
  const hasNested = routes.some((r) => r.code_mode_name !== null);
  const hasDeferred = routes.some((r) => r.deferred);
  const missingGateways = [];
  if (hasNested && !hasGateway("functions.exec", "custom"))
    missingGateways.push("functions.exec");
  if (hasDeferred && !hasGateway(searchName, "tool_search"))
    missingGateways.push(searchName);

  let comparisonReason: string | null = metadata.reason;
  if (
    !comparisonReason &&
    (onlyInCatalog.length || onlyInMetadata.length || missingGateways.length)
  ) {
    comparisonReason = "route_mismatch";
  }
  let reason = comparisonReason ?? catalog.reason;
  if (!reason) {
    const sole = routes[0];
    if (routes.length !== 1 || hasNested || hasDeferred)
      reason = "unexpected_route";
    else if (
      sole.source.kind !== "mcp" ||
      sole.source.server_name !== "realize_assignment"
    )
      reason = "reader_source_mismatch";
  }
  return {
    ...catalog,
    onlyDirectReader: catalog.onlyReader,
    directCatalogReason: catalog.reason,
    routes,
    comparison: {
      reason: comparisonReason,
      onlyInCatalog,
      onlyInMetadata,
      missingGateways,
    },
    onlyReader: reason === null,
    status: reason === null ? "verified" : "blocked",
    reason,
  };
}
