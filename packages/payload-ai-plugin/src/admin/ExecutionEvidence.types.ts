/**
 * @file packages/payload-ai-plugin/src/admin/ExecutionEvidence.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Определяет свойства результата выполнения и актуального ожидания исполнителя.
 */

import type {
  ChangeExecutionDTO,
  ExecutionJobDTO,
  ImplementationAcceptanceDTO,
} from "@realize/ai-contracts";

/** Доступность исполнителя приходит из текущего снимка диалога, отдельно от сохранённого результата. */
export type ExecutionEvidenceProps = {
  acceptance?: ImplementationAcceptanceDTO;
  job: ExecutionJobDTO;
  onAccept: () => void;
  onReject: (comment: string) => void;
  pending: boolean;
  reason?: string;
  worker?: ChangeExecutionDTO["worker"];
};
