/**
 * @file packages/template-realizeai-control-panel/src/controlPanelLayouts.metadata.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Объявляет два draft layout descriptor и exact alias pins выбранного выпуска шаблона.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import {
  parseTemplateLayoutCatalog,
  parseTemplateManifest,
  resolveTemplateLayout,
} from "@realize/template-contracts";
import manifestJson from "../template.manifest.json";
import { controlPanelPackageOwnerRegistration } from "./controlPanelOwnerRegistration.config";

const manifest = parseTemplateManifest(manifestJson);
const template = { namespace: "realize", id: manifest.id } as const;
const defaultIdentity = {
  namespace: "realize",
  id: "realizeai-control-panel.layout-default",
} as const;
const withoutTopbarIdentity = {
  namespace: "realize",
  id: "realizeai-control-panel.layout-without-topbar",
} as const;
const rail = {
  key: "rail",
  emptyBehavior: "preserve",
  slots: ["brand", "rail"],
} as const;
const sidebar = {
  key: "sidebar",
  emptyBehavior: "preserve",
  slots: ["sidebar"],
} as const;
const content = {
  key: "panel-content",
  emptyBehavior: "preserve",
  slots: ["panel-content"],
} as const;
const footer = {
  key: "footer",
  emptyBehavior: "preserve",
  slots: ["footer"],
} as const;
const common = {
  schemaVersion: "1.0",
  kind: "layout",
  owner: { identity: controlPanelPackageOwnerRegistration.identity },
  template,
  target: "admin",
  screen: "workspace",
  profile: { id: "realize.admin-panel-frame", version: "0.1.0" },
  guides: [
    {
      purpose: "usage",
      path: "README.md",
      anchor: "макеты-и-самостоятельные-версии",
    },
    {
      purpose: "development",
      path: "README.md",
      anchor: "макеты-и-самостоятельные-версии",
    },
  ],
} as const;

// Pins — явный выбор выпуска. Версия descriptor не подставляется в pin автоматически.
const source = {
  template: { identity: template, version: manifest.version },
  defaultLayoutId: "default",
  aliases: [
    {
      localId: "default",
      layout: { identity: defaultIdentity, version: "0.1.0" },
    },
    {
      localId: "without-topbar",
      layout: { identity: withoutTopbarIdentity, version: "0.1.0" },
    },
  ],
  descriptors: [
    {
      ...common,
      identity: defaultIdentity,
      version: "0.1.0",
      title: "Стандартный",
      description: "Каркас панели с верхней областью и независимым содержимым.",
      regions: [
        rail,
        { key: "topbar", emptyBehavior: "preserve", slots: ["topbar"] },
        sidebar,
        content,
        footer,
      ],
    },
    {
      ...common,
      identity: withoutTopbarIdentity,
      version: "0.1.0",
      title: "Без верхней панели",
      description:
        "Тот же каркас без topbar; отсутствующая область не принимает содержимое.",
      regions: [rail, sidebar, content, footer],
    },
  ],
} as const;

/** Проверенные immutable metadata; SHA-256 вычисляет только server catalog compiler. */
export const controlPanelLayoutCatalog = parseTemplateLayoutCatalog(source);
/** Readonly aliases сохраняют прежнюю публичную границу и не расходятся с frozen catalog после импорта. */
export const controlPanelLayoutIds = Object.freeze(
  source.aliases.map((alias) => alias.localId),
);
/** Local alias отделён от глобальной identity и версии определения. */
export type ControlPanelLayoutAlias = (typeof controlPanelLayoutIds)[number];
/** Наследуемый выбор выпуска не записывается в settings автоматически. */
export const controlPanelDefaultLayoutAlias = source.defaultLayoutId;
/** Labels получаются тем же exact resolver и недоступны для изменения через публичную ссылку. */
export const controlPanelLayoutLabels = Object.freeze(
  Object.fromEntries(
    controlPanelLayoutIds.map((localId) => [
      localId,
      resolveTemplateLayout(controlPanelLayoutCatalog, localId).descriptor
        .title,
    ]),
  ) as Record<ControlPanelLayoutAlias, string>,
);
