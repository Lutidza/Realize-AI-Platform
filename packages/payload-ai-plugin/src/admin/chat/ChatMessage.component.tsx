/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatMessage.component.tsx
 * @version 1.3.1
 * @date 2026-09-11
 * @description Показывает сообщение и сохраняет действующие карточки подтверждения операций.
 */

import { UiButton } from "@realize/ui-kit";
import { Database, FileCheck2, MessageSquareText } from "lucide-react";
import { ChangeRequestCard } from "../ChangeRequestCard";
import { DataOperationCard } from "../DataOperationCard";
import { ChatMessageContext } from "./ChatMessageContext.component";
import { CodexLogo } from "../integrations/codex/CodexLogo.component";
import type { ChatMessageProps } from "./ChatMessage.types";
import styles from "./ChatMessage.module.css";

export const ChatMessage = ({
  message,
  change,
  dataOperations = [],
  controller,
  tools,
  canClarifyChange,
  clarificationBlocked,
  onClarifyChange,
}: ChatMessageProps) => {
  const isUser = message.role === "user";
  const sourceRun = message.runID
    ? controller.detail?.runs.find((run) => run.id === message.runID)
    : undefined;
  const configuration = sourceRun?.agentConfiguration;
  const canPrepareCodeChange =
    message.role === "assistant" &&
    !message.dataOperationIntentAvailable &&
    !sourceRun?.workflow &&
    !change &&
    tools.codeChanges;
  return (
    <div className={isUser ? styles.userRow : styles.assistantRow}>
      {!isUser ? <CodexLogo className={styles.avatar} /> : null}
      <div className={styles.stack}>
        <article
          className={isUser ? styles.userMessage : styles.assistantMessage}
        >
          {!isUser ? (
            <div className={styles.meta}>
              <strong>{isUser ? "Вы" : "GPT — Codex"}</strong>
              <time dateTime={message.createdAt}>
                {new Date(message.createdAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ) : null}
          {message.content ? (
            <div className={styles.content}>{message.content}</div>
          ) : null}
          <ChatMessageContext message={message} />
          {!isUser && configuration && (
            <p className={styles.configuration}>
              {configuration.profileTitle || configuration.profileKey} · выпуск{" "}
              {configuration.releaseVersion}
            </p>
          )}
        </article>
        {!isUser &&
        message.dataOperationIntentAvailable &&
        !dataOperations.length &&
        tools.dataOperations ? (
          <UiButton
            className={styles.planAction}
            disabled={Boolean(controller.isPlanActionPending)}
            onClick={() => void controller.createDataOperation(message.id)}
            size="small"
            variant="ghost"
          >
            <Database size={15} />
            {controller.isPlanActionPending === message.id
              ? "Готовим изменение…"
              : "Подготовить изменение данных"}
          </UiButton>
        ) : null}
        {canPrepareCodeChange && message.changePlan?.status === "ready" ? (
          <UiButton
            className={styles.planAction}
            disabled={Boolean(controller.isPlanActionPending)}
            onClick={() => void controller.createChangeRequest(message.id)}
            size="small"
            variant="ghost"
          >
            <FileCheck2 size={15} />
            {controller.isPlanActionPending === message.id
              ? "Оформляем…"
              : "Оформить план изменения"}
          </UiButton>
        ) : null}
        {canPrepareCodeChange &&
        (!message.changePlan ||
          message.changePlan.status === "needs_clarification") ? (
          <>
            <p
              className={styles.planHint}
              role={clarificationBlocked ? "alert" : undefined}
            >
              {clarificationBlocked
                ? "Для уточнения не хватает места в поле сообщения. Сократите текст или сначала отправьте его. Ваш текст сохранён."
                : "Этот ответ ещё не содержит плана изменения."}
            </p>
            <UiButton
              className={styles.planAction}
              disabled={
                !canClarifyChange || Boolean(controller.isPlanActionPending)
              }
              onClick={() => onClarifyChange(message.id)}
              size="small"
              variant="ghost"
            >
              <MessageSquareText size={15} />
              Уточнить изменение
            </UiButton>
          </>
        ) : null}
        {change ? (
          <ChangeRequestCard
            change={change}
            onApprove={() =>
              void controller.decideChangeRequest(change, "approve")
            }
            onAcceptImplementation={() =>
              void controller.decideImplementation(change, "approve")
            }
            onAcceptPreview={() =>
              void controller.decidePreview(change, "approve")
            }
            onApproveRelease={() =>
              void controller.decideRelease(change, "approve")
            }
            onDeployPreview={() => void controller.deployPreview(change)}
            onExecute={() => void controller.executeChangeRequest(change)}
            onPrepareRelease={() => void controller.prepareRelease(change)}
            onPublishPullRequest={() =>
              void controller.publishPullRequest(change)
            }
            onReject={(comment) =>
              void controller.decideChangeRequest(change, "reject", comment)
            }
            onRejectImplementation={(comment) =>
              void controller.decideImplementation(change, "reject", comment)
            }
            onRejectPreview={(comment) =>
              void controller.decidePreview(change, "reject", comment)
            }
            onRejectRelease={(comment) =>
              void controller.decideRelease(change, "reject", comment)
            }
            pending={controller.isPlanActionPending === change.id}
          />
        ) : null}
        {dataOperations.map((dataOperation) => (
          <DataOperationCard
            key={dataOperation.id}
            onApply={() => void controller.applyDataOperation(dataOperation)}
            onApprove={() =>
              void controller.decideDataOperation(dataOperation, "approve")
            }
            onApproveRollback={() =>
              void controller.approveDataRollback(dataOperation)
            }
            onReject={(comment) =>
              void controller.decideDataOperation(
                dataOperation,
                "reject",
                comment,
              )
            }
            onRollback={() =>
              void controller.rollbackDataOperation(dataOperation)
            }
            operation={dataOperation}
            pending={controller.isPlanActionPending === dataOperation.id}
          />
        ))}
      </div>
    </div>
  );
};
