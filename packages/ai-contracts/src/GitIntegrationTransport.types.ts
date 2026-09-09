/**
 * @file packages/ai-contracts/src/GitIntegrationTransport.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт безопасный выбор Git-транспорта без ключей и учётных данных.
 */

/** SSH-профиль является идентификатором конфигурации исполнителя, а не путём или командой. */
export type GitIntegrationTransport =
  | { transport: "https"; sshProfileRef?: never }
  | { transport: "ssh"; sshProfileRef: string };
