/**
 * @file packages/payload-ai-plugin/src/admin/chat/ChatMessageContext.component.tsx
 * @version 1.0.0
 * @date 2026-09-09
 * @description Показывает приватные вложения, выбранные файлы и реальные источники ответа.
 */
/* eslint-disable @next/next/no-img-element -- Приватные URL и локальные preview требуют cookies браузера, без image proxy. */

import { FileCode2, FileText, Globe } from "lucide-react";
import type { ChatMessageContextProps } from "./ChatMessageContext.types";
import styles from "./ChatMessage.module.css";
export const ChatMessageContext = ({ message }: ChatMessageContextProps) => (
  <>
    {message.attachments?.length ||
    message.projectFiles?.length ||
    message.webSearch ? (
      <div className={styles.context}>
        {(message.attachments ?? []).map((file) => (
          <a
            className={styles.file}
            href={file.url}
            key={file.id}
            target="_blank"
            rel="noopener noreferrer"
          >
            {file.kind === "image" ? (
              <img
                className={styles.image}
                src={file.url}
                alt={file.name}
                loading="lazy"
              />
            ) : (
              <>
                <FileText size={16} />
                {file.name}
              </>
            )}
          </a>
        ))}
        {(message.projectFiles ?? []).map((file) => (
          <span className={styles.project} key={file.path}>
            <FileCode2 size={14} />
            {file.path}
          </span>
        ))}
        {message.webSearch ? (
          <span className={styles.project}>
            <Globe size={14} />
            Веб-поиск
          </span>
        ) : null}
      </div>
    ) : null}
    {message.sources?.length ? (
      <nav className={styles.sources} aria-label="Источники ответа">
        {message.sources
          .filter((source) => /^https?:\/\//i.test(source.url))
          .map((source, index) => (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              key={`${source.url}-${index}`}
            >
              {index + 1}. {source.title || source.url}
            </a>
          ))}
      </nav>
    ) : null}
  </>
);
