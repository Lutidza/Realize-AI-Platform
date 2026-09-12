/**
 * @file packages/payload-ai-plugin/src/admin/ChangeRequestCard.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Определяет действия карточки изменения и свойства свёрнутого завершённого этапа.
 */

import type { ChangeRequestDTO } from "@realize/ai-contracts";
import type { ReactNode } from "react";

/** Карточка получает серверный снимок и передаёт действия владельцу диалога. */
export type ChangeRequestCardProps = {
  change: ChangeRequestDTO;
  onApprove: () => void;
  onAcceptImplementation: () => void;
  onAcceptPreview: () => void;
  onApproveRelease: () => void;
  onDeployPreview: () => void;
  onExecute: () => void;
  onPrepareRelease: () => void;
  onPublishPullRequest: () => void;
  onReject: (comment: string) => void;
  onRejectImplementation: (comment: string) => void;
  onRejectPreview: (comment: string) => void;
  onRejectRelease: (comment: string) => void;
  pending: boolean;
};

export type CompletedStageProps = {
  approved: boolean;
  children: ReactNode;
  description: string;
  title: string;
};
