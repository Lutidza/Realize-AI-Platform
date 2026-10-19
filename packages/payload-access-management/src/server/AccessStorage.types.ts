/**
 * @file packages/payload-access-management/src/server/AccessStorage.types.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Задаёт внутренние parsed records и закрытую границу динамического Payload repository.
 * @see documentation/architecture/platform-access.md
 */
import type { z } from "zod";
import type {
  accessCredentialRecordSchema,
  accessDeviceRecordSchema,
} from "./accessStorage.schemas";
import type { ACCESS_COLLECTION_SLUGS } from "../accessManagement.constants";
export type AccessStorageSlug = (typeof ACCESS_COLLECTION_SLUGS)[number];
export type AccessStorageRow = {
  id: string | number;
  record?: unknown;
  [field: string]: unknown;
};
export type AccessCredentialRecord = z.infer<
  typeof accessCredentialRecordSchema
>;
export type AccessDeviceRecord = z.infer<typeof accessDeviceRecordSchema>;
