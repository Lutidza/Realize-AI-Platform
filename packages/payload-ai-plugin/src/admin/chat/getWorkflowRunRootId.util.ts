/**
 * @file packages/payload-ai-plugin/src/admin/chat/getWorkflowRunRootId.util.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Разрешает публичную идентичность корня процесса для выбора и повтора действий.
 */

import type { RunDTO } from "@realize/ai-contracts";

export const getWorkflowRunRootId = (run: RunDTO): string =>
  run.workflow?.rootRunID ?? run.workflow?.parentRunID ?? run.id;
