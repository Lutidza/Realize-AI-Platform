/**
 * @file packages/change-engine/src/systemCapabilityRegistry.ts
 * @version 1.2.0
 * @date 2026-09-13
 * @description Регистрирует текущие system capabilities и stable check IDs.
 * @docref Realize AI Commerce v1.0 — Change Engine
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/11-change-engine.md
 */

import type {
  CapabilityDescriptor,
  SystemAIConfigProjection,
} from "@realize/ai-contracts";

import { createCapabilityRegistry } from "./capabilityRegistry";
import { hashCanonicalJSON } from "./canonicalJson";

/** Стабильные идентификаторы фактических проверок Payload Data Lane. */
export const SYSTEM_CHECK_IDS = Object.freeze([
  "payload.access",
  "payload.audit",
  "payload.optimisticLock",
  "payload.selector.unique",
]);

const CATALOG_ASSIGN_CATEGORY_SOURCE = {
  actions: ["category.assign"],
  approvals: ["write_confirmation", "rollback_confirmation"],
  capabilityClass: "data",
  description:
    "Добавляет одну существующую категорию одному существующему товару через Payload Data Lane.",
  executor: {
    id: "catalog.assignCategory.executor",
    version: "1.0",
  },
  id: "catalog.assignCategory.v1",
  inputSchema: {
    id: "catalog.assignCategory.input",
    version: "1.0",
  },
  limits: { maxBatchSize: 1, maxTargets: 1 },
  projectProfiles: ["e-commerce"],
  requiredCheckIDs: SYSTEM_CHECK_IDS,
  resolver: {
    id: "catalog.assignCategory.resolver",
    version: "1.0",
  },
  riskLevel: "R1",
  riskSignals: ["existing-resources", "single-target"],
  scopes: {
    protectedResources: "deny",
    read: ["payload.categories", "payload.products"],
    write: ["payload.products.categories"],
  },
  support: {
    dryRun: true,
    idempotency: true,
    preview: false,
    rollback: true,
  },
  title: "Назначение категории товару",
  version: "1.0",
} satisfies CapabilityDescriptor;

const PAGES_CREATE_DRAFT_SOURCE = {
  actions: ["page.createDraft"],
  approvals: ["write_confirmation", "rollback_confirmation"],
  capabilityClass: "content",
  description:
    "Создаёт один неопубликованный черновик CMS-страницы из проверенного текста через Payload Data Lane.",
  executor: { id: "pages.createDraft.executor", version: "1.0" },
  id: "pages.createDraft.v1",
  inputSchema: { id: "pages.createDraft.input", version: "1.0" },
  limits: { maxBatchSize: 1, maxTargets: 1 },
  projectProfiles: ["e-commerce"],
  requiredCheckIDs: SYSTEM_CHECK_IDS,
  resolver: { id: "pages.createDraft.resolver", version: "1.0" },
  riskLevel: "R1",
  riskSignals: ["draft-only", "single-target"],
  scopes: {
    protectedResources: "deny",
    read: ["payload.pages"],
    write: ["payload.pages.draft"],
  },
  support: {
    dryRun: true,
    idempotency: true,
    preview: false,
    rollback: true,
  },
  title: "Создание черновика страницы",
  version: "1.0",
} satisfies CapabilityDescriptor;

const PAGES_UPDATE_DRAFT_SOURCE = {
  ...PAGES_CREATE_DRAFT_SOURCE,
  actions: ["page.updateDraft"],
  description:
    "Изменяет выбранные текстовые поля черновика по точному снимку, сохраняя структуру и опубликованную версию страницы.",
  executor: { id: "pages.updateDraft.executor", version: "1.0" },
  id: "pages.updateDraft.v1",
  inputSchema: { id: "pages.updateDraft.input", version: "1.0" },
  resolver: { id: "pages.updateDraft.resolver", version: "1.0" },
  title: "Редактирование черновика страницы",
} satisfies CapabilityDescriptor;

const PAGES_UPDATE_STRUCTURE_SOURCE = {
  ...PAGES_CREATE_DRAFT_SOURCE,
  actions: [
    "page.insertContentBlock",
    "page.moveContentBlock",
    "page.removeContentBlock",
  ],
  description:
    "Вставляет, перемещает или удаляет один поддержанный Content в черновике по stable ID и точной ревизии с подтверждением полного изменения. Доступно из обычного чата; workflow не подключён.",
  executor: { id: "pages.updateStructureDraft.executor", version: "1.0" },
  id: "pages.updateStructureDraft.v1",
  inputSchema: { id: "pages.updateStructureDraft.input", version: "1.0" },
  resolver: { id: "pages.updateStructureDraft.resolver", version: "1.0" },
  title: "Структура Content в черновике страницы",
} satisfies CapabilityDescriptor;

/** Неизменяемый серверный registry; точная версия выбирается без latest fallback. */
export const SYSTEM_CAPABILITY_REGISTRY = createCapabilityRegistry([
  CATALOG_ASSIGN_CATEGORY_SOURCE,
  PAGES_CREATE_DRAFT_SOURCE,
  PAGES_UPDATE_DRAFT_SOURCE,
  PAGES_UPDATE_STRUCTURE_SOURCE,
]);

/** Неизменяемый profile adapter каталога из system registry. */
export const CATALOG_ASSIGN_CATEGORY_CAPABILITY =
  SYSTEM_CAPABILITY_REGISTRY.require({
    id: "catalog.assignCategory.v1",
    version: "1.0",
  });

/** Точная версия реализованного adapter создания черновика; публикация не входит в ceiling. */
export const PAGES_CREATE_DRAFT_CAPABILITY = SYSTEM_CAPABILITY_REGISTRY.require(
  { id: "pages.createDraft.v1", version: "1.0" },
);

const systemProjectionPayload = {
  capabilities: SYSTEM_CAPABILITY_REGISTRY.list(),
  checkIDs: SYSTEM_CHECK_IDS,
  projectProfile: "e-commerce",
  releaseID: "realize-e-commerce-system-v1",
  version: "1.0.0",
} as const;

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
};

/** Точный серверный ceiling для валидации конфигурации и runtime binding. */
export const SYSTEM_AI_CONFIG_PROJECTION: SystemAIConfigProjection = deepFreeze(
  structuredClone({
    ...systemProjectionPayload,
    manifestHash: hashCanonicalJSON(systemProjectionPayload),
  }),
);
