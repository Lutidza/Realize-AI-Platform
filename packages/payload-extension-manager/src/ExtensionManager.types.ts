/**
 * @file packages/payload-extension-manager/src/ExtensionManager.types.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Описывает публичный snapshot каталога, назначений и готовности без storage документов.
 * @see documentation/specifications/extension-management.md
 */
import type {
  ExtensionAppearancePlanDto,
  ExtensionAppearanceReceiptDto,
  ExtensionTargetState,
} from "./appearance/ExtensionAppearance.types";
import type { ExtensionCatalogDto } from "./catalog/ExtensionCatalog.types";

/** Наличие compiled кода не подтверждает подключённый installer нового пакета. */
export type ExtensionManagerSnapshotDto = {
  catalog: ExtensionCatalogDto;
  storage: "ready" | "requires_schema";
  targets: { admin: ExtensionTargetState; frontend: ExtensionTargetState };
  history: ExtensionAppearanceReceiptDto[];
  permissions: { manageAppearance: boolean; installCode: boolean };
  codeInstallation: {
    ready: false;
    reason: "DELIVERY_ADAPTER_UNAVAILABLE";
  };
};
export type ExtensionPrepareResponseDto = {
  plan: ExtensionAppearancePlanDto;
  replayed: boolean;
};
export type ExtensionApplyResponseDto = {
  receipt: ExtensionAppearanceReceiptDto;
  replayed: boolean;
};
export type ExtensionHttpErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "STORAGE_UNAVAILABLE"
  | "SCHEMA_REQUIRED"
  | "DELIVERY_ADAPTER_UNAVAILABLE";
