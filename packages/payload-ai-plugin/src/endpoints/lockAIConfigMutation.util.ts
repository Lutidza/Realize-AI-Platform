/**
 * @file packages/payload-ai-plugin/src/endpoints/lockAIConfigMutation.util.ts
 * @version 1.0.1
 * @date 2026-09-11
 * @description Сериализует installation config mutations в их общей PostgreSQL транзакции.
 */

import type { PayloadRequest } from "payload";
import { lockAITransaction } from "./lockAITransaction.util";

/** Local API update(where) сначала читает записи, поэтому CAS защищает общий transaction lock. */
export const lockAIConfigMutation = async (
  req: PayloadRequest,
): Promise<void> => {
  await lockAITransaction(req, "configuration");
};
