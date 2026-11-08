/**
 * @file packages/engineering-runtime/src/engineeringRuntime.server.index.ts
 * @version 1.3.0
 * @date 2026-10-28
 * @description Экспортирует trusted server API, durable journal и порты общего исполнителя.
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
  engineeringPathSchema,
} from "./engineeringRuntime.contracts.index.ts";
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
  OperationState,
  EffectsSummary,
  ChecksSummary,
  BindingState,
  CancelState,
  WriteBlock,
  EngineeringErrorCode,
  EngineeringErrorDto,
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
  PreparedContentView,
} from "./engineeringRuntime.contracts.index.ts";
export { EngineeringRuntime } from "./runtime/EngineeringRuntime.service.ts";
export { EngineeringFailure } from "./runtime/EngineeringFailure.error.ts";
export type {
  EngineeringRuntimeOptions,
  EngineeringPrincipal,
  Admission,
  PreparedPlan,
  FrozenPlan,
  PlanningPort,
  SynchronousEffectPort,
} from "./runtime/EngineeringRuntime.types.ts";
export { openEngineeringStore } from "./storage/engineeringStorage.index.ts";
export type {
  EngineeringStore,
  OpenEngineeringStoreInput,
  StorageLimits,
} from "./storage/engineeringStorage.index.ts";
export {
  hashEngineeringValue,
  sha256Bytes,
} from "./contracts/hashEngineeringValue.util.ts";

export type {
  ArtifactDescriptorPort,
  ResolvedArtifactDescriptor,
  ResolvedFolderDescriptor,
  ArtifactInventoryPort,
  ArtifactMoveInput,
  ResolvedArtifactMove,
  ResolvedArtifactEdit,
  ArtifactDirectoryMoveInput,
  ResolvedArtifactDirectoryMove,
  ResolvedArtifactRelocation,
  ResolvedDirectoryRelocation,
} from "./artifacts/ArtifactDescriptor.types.ts";
export { createLocalFilesystemPorts } from "./filesystem/createLocalFilesystemPorts.service.ts";
export type { LocalFilesystemOptions } from "./filesystem/EngineeringFilesystem.types.ts";
export {
  loadEngineeringNative,
  NativeFilesystemError,
} from "./native/engineeringNative.index.ts";
export type {
  NativeFilesystem,
  LoadEngineeringNativeInput,
} from "./native/engineeringNative.index.ts";
export type {
  EngineeringContentPort,
  ContentIdentity,
} from "./content/EngineeringContent.types.ts";
