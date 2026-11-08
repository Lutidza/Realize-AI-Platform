/**
 * @file packages/engineering-runtime/src/contracts/EngineeringCommand.types.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Выводит типы команд из единственных strict runtime validators протокола.
 * @see documentation/architecture/engineering-operations.md
 */
import type { z } from "zod";
import type {
  engineeringCommandSchemas,
  engineeringIntentSchema,
  fileActionSchema,
} from "./engineeringCommands.schemas.ts";

export type { JsonValue } from "./CanonicalEngineeringJson.types.ts";

/** Совместимость dispatch проверяется по имени и соответствующему DTO команды. */
export type EngineeringCommandName = keyof typeof engineeringCommandSchemas;
export type EngineeringCommandByName = {
  [Name in EngineeringCommandName]: z.infer<
    (typeof engineeringCommandSchemas)[Name]
  >;
};
export type PrepareContentCommand = EngineeringCommandByName["prepareContent"];
export type PlanCommand = EngineeringCommandByName["plan"];
export type PreviewCommand = EngineeringCommandByName["preview"];
export type ApplyCommand = EngineeringCommandByName["apply"];
export type GetCommand = EngineeringCommandByName["get"];
export type CancelCommand = EngineeringCommandByName["cancel"];
export type InspectRecoveryCommand =
  EngineeringCommandByName["inspectRecovery"];
export type RecoverCommand = EngineeringCommandByName["recover"];
export type EventsCommand = EngineeringCommandByName["events"];
export type EngineeringIntent = z.infer<typeof engineeringIntentSchema>;
export type FileAction = z.infer<typeof fileActionSchema>;
