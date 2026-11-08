/**
 * @file packages/engineering-runtime/src/engineeringRuntime.contracts.index.ts
 * @version 1.1.1
 * @date 2026-10-28
 * @description Экспортирует browser-safe контракты общего инженерного протокола.
 * @see documentation/architecture/engineering-operations.md
 */
export {
  fileActionSchema,
  engineeringIntentSchema,
  prepareContentCommandSchema,
  planCommandSchema,
  previewCommandSchema,
  applyCommandSchema,
  getCommandSchema,
  cancelCommandSchema,
  inspectRecoveryCommandSchema,
  recoverCommandSchema,
  eventsCommandSchema,
  engineeringCommandSchemas,
} from "./contracts/engineeringCommands.schemas.ts";
export type {
  JsonValue,
  EngineeringCommandName,
  EngineeringCommandByName,
  PrepareContentCommand,
  PlanCommand,
  PreviewCommand,
  ApplyCommand,
  GetCommand,
  CancelCommand,
  InspectRecoveryCommand,
  RecoverCommand,
  EventsCommand,
  EngineeringIntent,
  FileAction,
} from "./contracts/EngineeringCommand.types.ts";
export type {
  OperationState,
  EffectsSummary,
  ChecksSummary,
  BindingState,
  CancelState,
  WriteBlock,
  EngineeringErrorCode,
  EngineeringErrorDto,
} from "./contracts/EngineeringState.types.ts";
export type {
  VersionRef,
  PlannedEffect,
  PlannedMoveArtifact,
  OperationPlan,
  OperationView,
  OperationReceipt,
  RecoveryView,
  PreviewPage,
  OperationEvent,
  EventPage,
} from "./runtime/EngineeringResult.types.ts";

export { engineeringPathSchema } from "./contracts/engineeringPrimitives.schemas.ts";
export type { PreparedContentView } from "./content/EngineeringContent.types.ts";
