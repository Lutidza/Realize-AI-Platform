/**
 * @file src/components/admin/extensions/ExtensionManager.types.ts
 * @version 1.1.1
 * @date 2026-10-12
 * @description Определяет вход экрана и клиентские операции через публичные DTO extension manager.
 * @see documentation/specifications/extension-management.md
 */
import type {
  ApplyExtensionAppearanceInput,
  ExtensionApplyResponseDto,
  ExtensionManagerSnapshotDto,
  ExtensionPrepareResponseDto,
  PrepareExtensionAppearanceInput,
} from "@realize/payload-extension-manager/contracts";
import type { TemplateSelection } from "@realize/template-contracts";
import type { SystemAdminContext } from "../system-shell/systemAdmin.types";
import type { ExtensionPendingMutation } from "./ExtensionMutation.types";

/** Сервер передаёт только безопасный actor/context, без Payload user document. */
export type ExtensionManagerProps = SystemAdminContext;
export type ExtensionManagerTransport = {
  snapshot: (signal?: AbortSignal) => Promise<ExtensionManagerSnapshotDto>;
  prepare: (
    input: PrepareExtensionAppearanceInput,
    requestId: string,
  ) => Promise<ExtensionPrepareResponseDto>;
  apply: (
    input: ApplyExtensionAppearanceInput,
    requestId: string,
  ) => Promise<ExtensionApplyResponseDto>;
};
export type ExtensionAppearanceDraft = {
  selection: TemplateSelection;
  settingsText: string;
};
export type ExtensionTemplateChange = {
  key: string;
  name: string;
  target: "admin" | "frontend";
};
export type ExtensionCommandInput =
  | { kind: "prepare"; input: PrepareExtensionAppearanceInput }
  | { kind: "apply"; input: ApplyExtensionAppearanceInput };
/** Serialized payload исключает alias к изменяемому draft и изменения transport при retry. */
export type ExtensionPendingCommand = ExtensionPendingMutation<
  ExtensionCommandInput["kind"]
>;
export type ExtensionCommandResult =
  | { kind: "prepare"; data: ExtensionPrepareResponseDto }
  | { kind: "apply"; data: ExtensionApplyResponseDto };
