/**
 * @file packages/ai-contracts/src/AIChatConfiguration.types.ts
 * @version 1.1.0
 * @date 2026-09-11
 * @description Разделяет выбор профиля, публичную сводку и закрытый снимок конфигурации запуска.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */

import type {
  ActiveAIConfigPointer,
  CompiledAgentConfiguration,
} from "./aiConfiguration";

/** Выбор клиента привязан к точному активному выпуску; инструкции собирает сервер. */
export type AIChatConfigurationSelection = {
  releaseID: string;
  manifestHash: string;
  profileKey: string;
};

/** Публичная сводка run не содержит instructions, bindings или закрытый snapshot. */
export type AIChatConfigurationSummary = {
  releaseID: string;
  releaseVersion: number;
  manifestHash: string;
  profileKey: string;
  profileTitle: string;
  profileRevision: number;
  compiledContextHash: string;
  systemManifestHash: string;
  systemReleaseID: string;
  pointerVersion: number;
};

/** Закрытый серверный снимок для run persistence и авторизованного control-plane transport. */
export type AIChatConfigurationSnapshot = {
  schemaVersion: "1.0";
  pointerVersion: number;
  releaseVersion: number;
  compiled: CompiledAgentConfiguration;
};

/** Доступные chat users профили одного активного выпуска без содержимого инструкций. */
export type AIChatConfigurationCatalogDTO = {
  activePointer: ActiveAIConfigPointer | null;
  release: { id: string; version: number; manifestHash: string } | null;
  profiles: readonly {
    key: string;
    title: string;
    description: string;
    locale: string;
    workflows?: readonly { key: string; title: string; description: string }[];
    defaultWorkflowKey?: string;
  }[];
};

/** context допускает только заранее подготовленный сервером безопасный текст. */
export type AIChatConfigurationRenderValues = {
  request: string;
  context?: string;
};
