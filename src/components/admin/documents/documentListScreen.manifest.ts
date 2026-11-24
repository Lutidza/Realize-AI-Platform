/**
 * @file src/components/admin/documents/documentListScreen.manifest.ts
 * @version 1.0.0
 * @date 2026-11-22
 * @description Описывает экран списка документов для реестра, агентов и обнаружения в редакторе.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import {
  elementIdentitySchema,
  elementOwnerRefSchema,
} from "@realize/element-registry";

const title = "Список документов";
const owner = elementOwnerRefSchema.parse({
  identity: { namespace: "realize", id: "project.realize-ai-platform" },
});
Object.freeze(owner.identity);
Object.freeze(owner);

/** Метаданные характеризуют экран; права на документы принадлежат серверному маршруту и ACL. */
export const documentListScreenManifest = Object.freeze({
  schemaVersion: "1.0",
  identity: Object.freeze(
    elementIdentitySchema.parse({
      namespace: "realize",
      id: "document-list-screen",
    }),
  ),
  kind: "component",
  version: "0.1.0",
  owner,
  title,
  description:
    "Показывает подготовленную страницу списка документов и переходы к чтению.",
  usage: Object.freeze({ scope: "preview-only", contentMode: "read-only" }),
  placement: Object.freeze({
    target: "admin",
    screen: "workspace",
    slot: "panel-content",
  }),
  agent: Object.freeze({
    purpose: "descriptive-only",
    hints: Object.freeze([
      "Список получает заголовок, адрес, описание и дату обновления от владельца маршрута.",
      "Пагинация и ссылка на чтение доступны в panel-content обоих макетов.",
    ]),
    operations: Object.freeze([]),
  }),
  editor: Object.freeze({
    discovery: "metadata-only",
    label: title,
    group: "Документы",
    readOnly: true,
  }),
});
