/**
 * @file packages/payload-ai-plugin/src/endpoints/payloadTransaction.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Делает составные Local API writes атомарными через общий Payload request.
 * @docref Realize — AI Platform v1.0 — Data/Config Pipeline
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */

import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
} from "payload";

/** Runs one unit of work in the request transaction it owns or inherits. */
export const withPayloadTransaction = async <T>(
  req: PayloadRequest,
  work: () => Promise<T>,
): Promise<T> => {
  const ownsTransaction = await initTransaction(req);
  try {
    const result = await work();
    if (ownsTransaction) await commitTransaction(req);
    return result;
  } catch (error) {
    if (ownsTransaction) await killTransaction(req);
    throw error;
  }
};
