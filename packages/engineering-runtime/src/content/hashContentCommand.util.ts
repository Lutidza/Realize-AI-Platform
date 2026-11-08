/**
 * @file packages/engineering-runtime/src/content/hashContentCommand.util.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Хеширует полную canonical content команду с отдельным ограниченным blob budget.
 * @see documentation/architecture/engineering-operations.md
 */
import type { PrepareContentCommand } from "../contracts/EngineeringCommand.types.ts";
import { hashEngineeringValue } from "../contracts/hashEngineeringValue.util.ts";
import { CONTENT_COMMAND_MAX_BYTES } from "./engineeringContent.constants.ts";

/** Общий namespace request сохраняется; увеличивается только budget canonical blob transport. */
export function hashContentCommand(command: PrepareContentCommand): string {
  return hashEngineeringValue(command, { maxBytes: CONTENT_COMMAND_MAX_BYTES });
}
