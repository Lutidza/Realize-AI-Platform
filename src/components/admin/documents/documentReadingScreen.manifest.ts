/**
 * @file src/components/admin/documents/documentReadingScreen.manifest.ts
 * @version 1.0.0
 * @date 2026-11-22
 * @description Описывает preview-only экран чтения без регистрации runtime-команд или возможностей редактора.
 * @see documentation/specifications/realize-ai-commerce/v1.0/01-architecture/07-declarative-first.md
 */
import {
  elementIdentitySchema,
  elementOwnerRefSchema,
} from "@realize/element-registry";

const title = "Чтение документа";
const owner = elementOwnerRefSchema.parse({
  identity: { namespace: "realize", id: "project.realize-ai-platform" },
});
Object.freeze(owner.identity);
Object.freeze(owner);

/** Owner identity является ссылкой; разрешение владельца и source binding принадлежат серверной регистрации. */
export const documentReadingScreenManifest = Object.freeze({
  schemaVersion: "1.0",
  identity: Object.freeze(
    elementIdentitySchema.parse({
      namespace: "realize",
      id: "document-reading-screen",
    }),
  ),
  kind: "component",
  version: "0.1.0",
  owner,
  title,
  description:
    "Показывает подготовленный документ в области содержимого панели без загрузки или сохранения данных.",
  usage: Object.freeze({
    scope: "preview-only",
    contentMode: "read-only",
  }),
  placement: Object.freeze({
    target: "admin",
    screen: "workspace",
    slot: "panel-content",
  }),
  agent: Object.freeze({
    purpose: "descriptive-only",
    hints: Object.freeze([
      "Данные документа передаёт владелец экрана; компонент не создаёт коллекцию документации и не обращается к БД.",
      "Один компонент размещается в panel-content обоих макетов; навигация и topbar не являются его зависимостями.",
      "Описание не предоставляет агенту прав на чтение или изменение документов и не регистрирует инструменты.",
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
