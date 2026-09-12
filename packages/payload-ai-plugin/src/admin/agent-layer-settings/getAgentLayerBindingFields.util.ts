/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/getAgentLayerBindingFields.util.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Создаёт независимые поля формы возможности или проверки с сохранением наследуемых ограничений.
 */

import type {
  AgentLayerBindingArtifact,
  AgentLayerBindingInput,
  AgentLayerBindingKind,
} from "./AgentLayerBinding.types";

/** Выбирает редактируемые поля явно, не подставляя новую системную версию вместо сохранённой. */
export const getAgentLayerBindingFields = (
  kindOrSource: AgentLayerBindingKind | AgentLayerBindingArtifact,
): AgentLayerBindingInput => {
  const source = typeof kindOrSource === "string" ? undefined : kindOrSource;
  const kind =
    typeof kindOrSource === "string" ? kindOrSource : kindOrSource.kind;
  const base = {
    key: source?.key ?? "",
    title: source?.title ?? "",
    enabled: source?.enabled ?? true,
  };
  if (kind === "check_binding") {
    return {
      ...base,
      kind,
      checkID: source?.kind === kind ? source.checkID : "",
    };
  }
  const capability = source?.kind === kind ? source : undefined;
  return {
    ...base,
    kind,
    capability: capability
      ? { id: capability.capability.id, version: capability.capability.version }
      : { id: "", version: "" },
    allowedActions: capability ? [...capability.allowedActions] : [],
    maxTargets:
      capability?.maxTargets === undefined ? "" : String(capability.maxTargets),
    ...(capability?.readScopes === undefined
      ? {}
      : { readScopes: [...capability.readScopes] }),
    ...(capability?.writeScopes === undefined
      ? {}
      : { writeScopes: [...capability.writeScopes] }),
  };
};
