/**
 * @file tests/e2e/support/taskManagerAcceptance/FixtureIncludes.types.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Описывает восстановление только двух Next types includes текущей fixture.
 * @see documentation/specifications/task-management-execution.md
 */
export type FixtureIncludesGuard = { restore(): Promise<void> };
