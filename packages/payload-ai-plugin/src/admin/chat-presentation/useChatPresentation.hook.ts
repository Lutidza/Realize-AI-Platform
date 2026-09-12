/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/useChatPresentation.hook.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Читает размещение чата для навигации и подключённых поверхностей.
 */

"use client";
import { createContext, useContext } from "react";
import type { ChatPresentationController } from "./ChatPresentation.types";

export const ChatPresentationContext =
  createContext<ChatPresentationController | null>(null);

/** Отсутствующий доступ не создаёт альтернативное состояние чата. */
export const useChatPresentation = () => useContext(ChatPresentationContext);
