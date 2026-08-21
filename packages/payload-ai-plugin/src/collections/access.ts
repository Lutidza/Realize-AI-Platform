/**
 * @file packages/payload-ai-plugin/src/collections/access.ts
 * @version 2026-08-17
 * @description Adapts plugin access callbacks to Payload collection access functions.
 */

import type { Access } from "payload";

export const createCollectionAccess = (): {
  deny: Access;
  read: Access;
} => ({
  deny: () => false,
  // Runtime records are exposed only through DTO-mapped plugin endpoints.
  read: () => false,
});
