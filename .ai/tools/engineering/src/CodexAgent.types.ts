/**
 * @file .ai/tools/engineering/src/CodexAgent.types.ts
 * @version 1.0.0
 * @date 2026-11-09
 * @description Описывает минимальный native контракт Codex-роли без выдачи полномочий.
 * @see documentation/specifications/agent-authoring.md
 */
/** Права, tools и skills подтверждает host; native профиль их не подключает. */
export interface CodexAgentInput {
  name: string;
  description: string;
  developer_instructions: string;
}
