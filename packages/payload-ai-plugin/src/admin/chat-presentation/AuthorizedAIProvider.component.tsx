/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/AuthorizedAIProvider.component.tsx
 * @version 1.0.1
 * @date 2026-09-10
 * @description Подключает единый controller и размещение чата для авторизованного дерева Admin.
 */

"use client";

import { RealizeAIContext } from "../RealizeAIContext";
import { useRef } from "react";
import { ChatHost } from "./ChatHost.component";
import type { RealizeAIProviderProps } from "./ChatPresentation.types";
import { useChatHosting } from "./useChatHosting.hook";
import { ChatPresentationContext } from "./useChatPresentation.hook";
import styles from "./ChatHost.module.css";

/** Собственная оболочка освобождает место панели, сохраняя тему остальных страниц. */
export const AuthorizedAIProvider = (props: RealizeAIProviderProps) => {
  const { controller, presentation } = useChatHosting(props);
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <RealizeAIContext value={controller}>
      <ChatPresentationContext value={presentation}>
        <div
          ref={rootRef}
          className={`${styles.root} ${presentation.panelOpen ? styles.docked : ""}`}
        >
          {props.children}
          <ChatHost rootRef={rootRef} />
        </div>
      </ChatPresentationContext>
    </RealizeAIContext>
  );
};
