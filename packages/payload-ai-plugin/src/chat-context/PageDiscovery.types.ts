/**
 * @file packages/payload-ai-plugin/src/chat-context/PageDiscovery.types.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Описывает закрытый допуск и журнал серверных чтений одного запуска.
 */
import type { PageDiscoveryCall } from "@realize/ai-contracts";

/** Подписанные сервером claims; не являются параметрами инструмента модели. */
export type PageDiscoveryClaims = {
  version: 1;
  runID: string;
  userID: string;
  issuedAt: number;
  expiresAt: number;
};

/** Резервирование сохраняется до чтения: ошибки тоже расходуют бюджет вызовов. */
export type PageDiscoveryCallRecord = {
  callID: string;
  requestHash: string;
  name: PageDiscoveryCall["name"];
  status: "pending" | "completed" | "failed";
};
