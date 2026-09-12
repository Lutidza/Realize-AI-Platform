/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatPendingFiles.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Показывает локальные превью, настоящий прогресс и повтор загрузки.
 */

/* eslint-disable @next/next/no-img-element -- Приватные URL и локальные preview требуют cookies браузера, без image proxy. */

import { UiButton } from "@realize/ui-kit";
import { FileCode2, FileText, RotateCw, X } from "lucide-react";
import type { ChatPendingFilesProps } from "./ChatPendingFiles.types";
import styles from "./ChatComposer.module.css";
export const ChatPendingFiles = ({
  context,
  disabled,
}: ChatPendingFilesProps) => (
  <div className={styles.attachments}>
    {context.attachments.map((item) => {
      const name = item.file?.name ?? item.attachment?.name ?? "Файл";
      const preview =
        item.previewUrl ??
        (item.attachment?.kind === "image" ? item.attachment.url : undefined);
      return (
        <div
          className={styles.attachment}
          key={item.clientId}
          data-status={item.status}
        >
          {preview ? (
            <img className={styles.preview} src={preview} alt={name} />
          ) : (
            <FileText size={22} />
          )}
          <div className={styles.attachmentInfo}>
            <strong title={name}>{name}</strong>
            {item.status === "uploading" ? (
              <>
                <span>Загрузка {item.progress}%</span>
                <progress
                  aria-label={`Загрузка ${name}`}
                  max={100}
                  value={item.progress}
                />
              </>
            ) : item.error ? (
              <span role="alert">{item.error}</span>
            ) : (
              <span>{item.isRemoving ? "Удаляем…" : "Готово"}</span>
            )}
          </div>
          {item.status === "failed" ? (
            <UiButton
              aria-label={`Повторить загрузку ${name}`}
              disabled={disabled}
              size="icon"
              variant="ghost"
              onClick={() => context.retryAttachment(item.clientId)}
            >
              <RotateCw size={14} />
            </UiButton>
          ) : null}
          <UiButton
            aria-label={`Удалить ${name}`}
            disabled={disabled || item.isRemoving}
            size="icon"
            variant="ghost"
            onClick={() => void context.removeAttachment(item.clientId)}
          >
            <X size={14} />
          </UiButton>
        </div>
      );
    })}
    {context.projectFiles.map((file) => (
      <div className={styles.projectChip} key={file.path}>
        <FileCode2 size={15} />
        <span title={file.path}>{file.path}</span>
        <UiButton
          aria-label={`Убрать файл проекта ${file.path}`}
          disabled={disabled}
          size="icon"
          variant="ghost"
          onClick={() =>
            context.setProjectFiles(
              context.projectFiles.filter((item) => item.path !== file.path),
            )
          }
        >
          <X size={13} />
        </UiButton>
      </div>
    ))}
  </div>
);
