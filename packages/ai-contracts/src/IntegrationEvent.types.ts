/**
 * @file packages/ai-contracts/src/IntegrationEvent.types.ts
 * @version 1.0.0
 * @date 2026-09-23
 * @description Выводит тип действия audit из общего закрытого каталога.
 */
import type { INTEGRATION_EVENT_ACTIONS } from "./integrationEvents.constants";
export type IntegrationEventAction = (typeof INTEGRATION_EVENT_ACTIONS)[number];
