/**
 * @file packages/payload-ai-plugin/src/admin/chat-presentation/ChatDeepLink.types.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Задаёт порт открытия диалога по ссылке без сброса черновика.
 */
import type { RealizeAIController } from "../RealizeAIController.types";

export type ChatDeepLinkOptions = {
  controller: RealizeAIController;
  enabled: boolean;
  onNotice: (message: string | undefined) => void;
};
