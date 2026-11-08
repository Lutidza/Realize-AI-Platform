/**
 * @file packages/engineering-runtime/src/runtime/EngineeringRuntime.types.ts
 * @version 1.1.0
 * @date 2026-10-26
 * @description Задаёт доверенные порты и приватную запись общего исполнителя.
 * @see documentation/architecture/engineering-operations.md
 */
import type {
  PlanCommand,
  JsonValue,
} from "../contracts/EngineeringCommand.types.ts";
import type {
  EngineeringErrorDto,
  EffectsSummary,
  ChecksSummary,
  OperationState,
  WriteBlock,
  CancelState,
} from "../contracts/EngineeringState.types.ts";
import type {
  OperationPlan,
  OperationReceipt,
  PlannedEffect,
  VersionRef,
} from "./EngineeringResult.types.ts";
import type { EngineeringStore } from "../storage/engineeringStorage.index.ts";
import type { EngineeringContentPort } from "../content/EngineeringContent.types.ts";

/** Identity задаётся сервером после аутентификации; клиентская команда её не содержит. */
export interface EngineeringPrincipal {
  actorKind: string;
  actorId: string;
  clientId: string;
}
export interface Admission {
  command: string;
  targetId: string;
  operationId: string | null;
  intent: PlanCommand["intent"] | null;
  effect: PlannedEffect | null;
}
/** Полный manifest включает negative lookups и identity, а не только хеш редактируемого файла. */
export interface PreparedPlan {
  targetVersion: string;
  sourceManifestHash: string;
  policyRefs: VersionRef[];
  recipeRefs: VersionRef[];
  effects: PlannedEffect[];
  checkSelection: string[];
  coverage: { complete: boolean; limitations: string[] };
  snapshots: string[];
  privateData: JsonValue;
}
export interface FrozenPlan {
  public: OperationPlan;
  prepared: PreparedPlan;
  intent: PlanCommand["intent"];
}
export interface PlanningPort {
  /** Только ограниченное чтение/подготовленные данные. Генераторы с процессами подключаются позже. */
  prepare(command: PlanCommand): PreparedPlan;
  /** Сверяет все версии plan, policy и namespace; возвращает digest cumulative manifest. */
  snapshot(plan: FrozenPlan): string;
}
export interface SynchronousEffectPort {
  mode: "in_process_sync";
  /** Один durable primitive без дочерних процессов/отложенных writers; backup/staging уже в плане. */
  apply(plan: FrozenPlan, index: number): void;
  /** Ports с отдельным fsync повторяют durability barrier после найденного after, без повторного эффекта. */
  confirmDurable?(plan: FrozenPlan, index: number): void;
}
export interface EngineeringRuntimeOptions {
  store: EngineeringStore;
  principal: EngineeringPrincipal;
  /** Fresh ACL, scope и owner проверяются и при replay; отказ — исключение FORBIDDEN. */
  authorize(admission: Admission): Promise<{ scopeVersion: string }>;
  planner: PlanningPort;
  effects?: SynchronousEffectPort;
  content?: EngineeringContentPort;
  now?: () => number;
}
export interface OperationData {
  version: 1;
  plan: FrozenPlan | null;
  intent: PlanCommand["intent"];
  taskRefs: string[];
  state: OperationState;
  attempt: number;
  cursor: number;
  pending: number | null;
  effects: EffectsSummary;
  checks: ChecksSummary;
  executionMode: "none" | "in_process_sync" | "unconfirmed";
  cancelState: CancelState;
  writeBlock: WriteBlock;
  error: EngineeringErrorDto | null;
  activeRequestHash: string;
  receipts: OperationReceipt[];
}
export interface RuntimeRecord {
  operationId: string;
  workspaceId: string;
  revision: number;
  state: string;
  writeBlock: WriteBlock;
  payload: OperationData;
}
