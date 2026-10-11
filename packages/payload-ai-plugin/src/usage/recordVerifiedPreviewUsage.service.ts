/**
 * @file packages/payload-ai-plugin/src/usage/recordVerifiedPreviewUsage.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Связывает успех задачи с настоящим preview evidence в transaction владельца domain result.
 */
import type { PoolClient } from "pg";
import { readUsageIdentity } from "./readUsageIdentity.config";
import { appendUsageEvent } from "./usageLedgerEvent.repository";

export async function recordVerifiedPreviewUsage(
  client: PoolClient,
  deploymentKey: string,
  changeRequestId: number,
  evidenceHash: string,
): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(evidenceHash))
    throw new Error("USAGE_TASK_EVIDENCE_REQUIRED");
  const identity = readUsageIdentity();
  const taskId = `change:${changeRequestId}`;
  await appendUsageEvent(
    client,
    `verified-preview:${deploymentKey}`,
    `${identity.installationId}:${identity.projectId}:${taskId}`,
    "task_verified",
    {
      schemaVersion: "1.0",
      installationId: identity.installationId,
      projectId: identity.projectId,
      taskId,
      purpose: "customer_runtime",
      definition: "verified_preview",
      evidenceHash,
      verifiedAt: new Date().toISOString(),
    },
  );
}
