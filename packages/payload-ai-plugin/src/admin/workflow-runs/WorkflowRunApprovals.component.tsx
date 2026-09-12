/**
 * @file packages/payload-ai-plugin/src/admin/workflow-runs/WorkflowRunApprovals.component.tsx
 * @version 1.0.0
 * @date 2026-09-11
 * @description Связывает существующие карточки изменений с правами и повторами в реестре процессов.
 */

import { UiButton, UiNotice } from "@realize/ui-kit";
import { DataOperationCard } from "../DataOperationCard";
import type { WorkflowRunActionsProps } from "./WorkflowRuns.types";
import styles from "./WorkflowRuns.module.css";

export const WorkflowRunApprovals = ({
  controller,
}: WorkflowRunActionsProps) => {
  const { detail, dataActions } = controller;
  if (!detail) return null;
  const disabled =
    !detail.permissions.canManageData ||
    detail.item.conversation.status === "archived" ||
    controller.isLocked ||
    controller.loading;
  return (
    <div className={styles.stack}>
      {dataActions.hasRetry ? (
        <UiNotice>
          Результат операции не подтверждён.
          <UiButton
            disabled={Boolean(controller.operationPending)}
            onClick={() => void dataActions.retry()}
          >
            Повторить операцию
          </UiButton>
        </UiNotice>
      ) : null}
      {!detail.permissions.canManageData && detail.dataOperations.length ? (
        <UiNotice>У вас нет права подтверждать изменения данных.</UiNotice>
      ) : null}
      {detail.dataOperations.map((operation) => (
        <DataOperationCard
          key={operation.id}
          operation={operation}
          pending={disabled}
          onDraftChange={(value) =>
            controller.setOperationDraft(operation.id, value)
          }
          onApprove={() => {
            if (!disabled)
              void dataActions.decideDataOperation(operation, "approve");
          }}
          onReject={(comment) => {
            if (!disabled)
              void dataActions.decideDataOperation(
                operation,
                "reject",
                comment,
              );
          }}
          onApply={() => {
            if (!disabled) void dataActions.applyDataOperation(operation);
          }}
          onApproveRollback={() => {
            if (!disabled) void dataActions.approveDataRollback(operation);
          }}
          onRollback={() => {
            if (!disabled) void dataActions.rollbackDataOperation(operation);
          }}
        />
      ))}
      {!detail.dataOperations.length ? (
        <p className={styles.empty}>Подтверждений изменений данных нет.</p>
      ) : null}
    </div>
  );
};
