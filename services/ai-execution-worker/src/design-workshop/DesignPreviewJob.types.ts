/**
 * @file services/ai-execution-worker/src/design-workshop/DesignPreviewJob.types.ts
 * @version 1.1.0
 * @date 2026-09-26
 * @description Задаёт private claim с fencing token и server-owned source pin.
 * @see documentation/specifications/design-workshop.md
 */
import type {
  DesignWorkspacePin,
  McpWorkshopIdentity,
} from "@realize/ai-contracts";
export type ClaimedDesignPreview = {
  jobId: string;
  projectId: string;
  revisionId: string;
  actorId: string;
  source: DesignWorkspacePin;
  mcpAuthorization?: McpWorkshopIdentity;
  entryPath: string;
  leaseToken: string;
  attempt: number;
};
export type DesignPreviewJobRow = {
  job_id: string;
  project_id: string;
  revision_id: string;
  requested_by_id: string | number;
  source_pin: unknown;
  mcp_authorization: unknown;
  entry_path: string;
  lease_token: string;
  attempt: string | number;
};
