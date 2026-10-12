/**
 * @file packages/payload-extension-manager/src/server/createAdminShellRepository.service.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Подключает строгий shell codec к общему native state/receipt repository.
 * @see documentation/specifications/extension-management.md
 */
import type { Payload } from "payload";
import { adminShellReceiptSchema } from "../admin-shell/adminShell.schemas";
import { parseAdminShellStore } from "../admin-shell/parseAdminShellStore.validator";
import { ExtensionStateRepository } from "../persistence/ExtensionState.repository";

/** Отдельный scope сохраняет прежний appearance schema/ledger без изменения записей. */
export const adminShellScope = (scopeKey: string) => `${scopeKey}:admin-shell`;
export const createAdminShellRepository = (payload: Payload) =>
  new ExtensionStateRepository(payload, {
    parseStore: parseAdminShellStore,
    parseReceipt: (value: unknown) => adminShellReceiptSchema.parse(value),
  });
