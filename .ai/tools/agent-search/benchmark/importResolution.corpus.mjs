/**
 * @file .ai/tools/agent-search/benchmark/importResolution.corpus.mjs
 * @version 1.0.0
 * @date 2026-09-28
 * @description Задаёт независимые цели реальных imports: services, Payload aliases, workspace contracts и UI.
 */
const plane = "services/ai-control-plane/src";
const mcp = "services/internal-mcp/src";
const observation = "packages/payload-ai-plugin/src/search-observability";
const store = `${observation}/SearchObservationStore.repository.ts`;
const payload = "src/payload.config.ts";

// Anchors заданы по исходникам, не выведены из исследуемого resolver.
export const importResolutionCorpus = [
  [
    "reader-service",
    `${plane}/searchRepository.service.ts`,
    "readRepositoryFile",
    `${plane}/readRepositoryFile.service.ts`,
    "export async function readRepositoryFile(",
  ],
  [
    "mcp-dispatch",
    `${mcp}/executeMcpTool.service.ts`,
    "searchRepository",
    `${plane}/searchRepository.service.ts`,
    "export async function searchRepository(",
  ],
  [
    "mapper",
    store,
    "mapSearchObservation",
    `${observation}/mapSearchObservation.mapper.ts`,
    "export function mapSearchObservation(",
  ],
  [
    "control-class",
    store,
    "SearchObservationControl",
    `${observation}/SearchObservationControl.repository.ts`,
    "export class SearchObservationControl",
  ],
  [
    "transaction",
    store,
    "withSearchObservationTransaction",
    `${observation}/withSearchObservationTransaction.adapter.ts`,
    "export async function withSearchObservationTransaction",
  ],
  [
    "payload-alias",
    payload,
    "Categories",
    "src/collections/Categories.ts",
    "export const Categories:",
  ],
  [
    "payload-task",
    payload,
    "processMediaTask",
    "src/collections/Media/processMedia.task.ts",
    "export const processMediaTask:",
  ],
  [
    "payload-role-suffix",
    payload,
    "MediaProfiles",
    "src/collections/Media/MediaProfiles.collection.ts",
    "export const MediaProfiles:",
  ],
  [
    "directory-index",
    payload,
    "plugins",
    "src/plugins/index.ts",
    "export const plugins:",
  ],
  [
    "global-alias",
    payload,
    "Footer",
    "src/globals/Footer.ts",
    "export const Footer:",
  ],
  [
    "workspace-type",
    store,
    "SearchObservation",
    "packages/ai-contracts/src/SearchObservation.types.ts",
    "export type SearchObservation =",
  ],
  [
    "workspace-schema",
    store,
    "searchObservationSchema",
    "packages/ai-contracts/src/searchObservation.schemas.ts",
    "export const searchObservationSchema =",
  ],
  [
    "workspace-public-subpath",
    `${mcp}/createManagedMcpRuntime.config.ts`,
    "SearchObservationStore",
    `${observation}/SearchObservationStore.repository.ts`,
    "export class SearchObservationStore",
  ],
  [
    "workspace-jsx",
    "packages/payload-ai-plugin/src/admin/search-observability/SearchObservationsClient.component.tsx",
    "UiButton",
    "packages/ui-kit/src/button/UiButton.component.tsx",
    "export const UiButton =",
  ],
].map(([id, from, query, expectedPath, anchor]) => ({
  id,
  from,
  query,
  expectedPath,
  anchor,
}));

export const importResolutionRefusals = [
  {
    id: "external-library",
    from: payload,
    query: "buildConfig",
    reason: "external_dependency",
  },
  {
    id: "node-builtin",
    from: payload,
    query: "path",
    reason: "external_dependency",
  },
];

// Переход → usages в известном owner → imports найденного файла: 3 настоящих вызова.
export const importResolutionWorkflows = [
  {
    id: "mcp-change-impact",
    from: `${mcp}/executeMcpTool.service.ts`,
    query: "searchRepository",
    consumers: mcp,
  },
  {
    id: "store-change-impact",
    from: `${mcp}/createManagedMcpRuntime.config.ts`,
    query: "SearchObservationStore",
    consumers: `${mcp}/createManagedMcpRuntime.config.ts`,
  },
];
