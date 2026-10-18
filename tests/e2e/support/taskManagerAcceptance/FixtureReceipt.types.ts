/**
 * @file tests/e2e/support/taskManagerAcceptance/FixtureReceipt.types.ts
 * @version 1.0.0
 * @date 2026-10-15
 * @description Описывает собственную открытую квитанцию фикстуры без сериализации producer handle.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  TaskManagerFixtureReceipt,
  FixtureReceiptResult,
} from "./TaskManagerAcceptance.types";

export type FixtureReceiptInput = Pick<
  TaskManagerFixtureReceipt,
  "outcome" | "reason" | "resourceCleanup" | "main"
>;

/** Объект существует только в создавшем процессе; JSON-квитанция не восстанавливает полномочия записи. */
export type FixtureReceiptCoordinator = {
  finish(input: FixtureReceiptInput): FixtureReceiptResult;
};
