/**
 * @file .ai/tools/codex-request-diagnostics/src/requestFingerprint.types.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Определяет закрытый allowlist диагностических событий без исходного содержимого запросов.
 */

/** Контекст реально отправленного application request; имена заголовков не копируются в события. */
export interface RequestObservationContext {
  transport: "http1" | "http2" | "websocket";
  connection: number;
  headers: Readonly<Record<string, string | undefined>>;
}

/** Ограничения можно только уменьшать относительно встроенных верхних пределов. */
export interface RequestFingerprintLimits {
  maxRequests: number;
  maxBodyBytes: number;
  maxTotalBytes: number;
  maxItems: number;
  maxConnections: number;
  maxCorrelations: number;
  maxPendingPerConnection: number;
  maxCanonicalNodes: number;
  maxEvents: number;
}

export type GenerationKind = "generation" | "prewarm" | "unknown";
export type DiagnosticCoverageCode =
  | "invalid_context"
  | "request_limit"
  | "body_limit"
  | "total_bytes_limit"
  | "items_limit"
  | "connection_limit"
  | "pending_limit"
  | "correlation_limit"
  | "invalid_json"
  | "unsupported_request"
  | "canonical_limit"
  | "response_invalid"
  | "prewarm_ambiguous"
  | "event_limit";

/** Нулевые значения допустимы только при наличии всех подтверждённых числовых полей. */
export type DiagnosticUsage =
  | {
      state: "known";
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
    }
  | { state: "unknown" };

/** Typed группы одного input item; неизвестные поля остаются только в opaque HMAC. */
export interface DiagnosticInputItemParts {
  identityHash: string;
  contentHash: string;
  metadataHash: string;
}

/** Только описанные backend enums; неизвестные значения остаются opaque, без эха. */
export interface DiagnosticCacheDiagnostics {
  type:
    | "cache_hit"
    | "cache_miss"
    | "comparison_response_not_found"
    | "unavailable"
    | "not_provided"
    | "unknown";
  reason:
    | "model_changed"
    | "prompt_cache_key_changed"
    | "service_tier_changed"
    | "tools_changed"
    | "text_format_changed"
    | "reasoning_effort_changed"
    | "verbosity_changed"
    | "context_compacted"
    | "input_changed"
    | "not_provided"
    | "unknown";
  diagnosticsHash: string | null;
  cacheMissedTokens: number | null;
  comparisonReusableTokens: number | null;
}

/** Все строки данных — HMAC; остальные строки выбираются только из фиксированных enums. */
export interface RequestFingerprintEvent {
  schemaVersion: 1;
  kind: "request";
  connection: number;
  sequence: number;
  transport: RequestObservationContext["transport"];
  /** Наличие собственного поля в request payload; client_metadata также допускает известный WS envelope слот. */
  presence: {
    model: boolean;
    instructions: boolean;
    tools: boolean;
    prompt_cache_key: boolean;
    metadata: boolean;
    client_metadata: boolean;
  };
  toolShape: "absent" | "null" | "array" | "object" | "other";
  generation: GenerationKind;
  bodyBytes: number;
  bodyHash: string;
  canonicalBodyHash: string;
  modelHash: string;
  serviceTierHash: string;
  instructionsHash: string;
  toolsHash: string;
  toolCount: number | null;
  toolItemHashes: string[] | null;
  optionsHash: string;
  opaqueOptionsHash: string;
  opaqueOptionsCount: number;
  cacheKeyHash: string;
  metadataHash: string;
  clientMetadataHash: string;
  headersHash: string;
  affinityHashes: {
    sessionIdHash: string | null;
    threadIdHash: string | null;
    turnStateHash: string | null;
    routingHintHash: string | null;
  };
  inputMode: "full" | "delta" | "unknown";
  inputItemCount: number | null;
  inputItemHashes: string[] | null;
  inputItemParts: DiagnosticInputItemParts[] | null;
  /** Тот же domain, что responseIdHash; null для отсутствующего/невалидного ID, без эха. */
  continuationIdHash: string | null;
  /** Только prefix input items; model/instructions/tools/options/key сравниваются отдельно. */
  prefix: {
    comparedRequest: number;
    commonItems: number;
    appendOnly: boolean;
  } | null;
}

/** Подтверждение создания response сохраняет только ID HMAC/binding, без usage или содержимого. */
export interface SafeResponseCreatedEvent {
  schemaVersion: 1;
  kind: "response_created";
  connection: number;
  requestSequence: number | null;
  responseIdHash: string;
  generation: GenerationKind;
  correlation: "created_fifo" | "unknown";
}

/** ID связывается с созданным ответом; неоднозначность остаётся явной, без угадывания. */
export interface ResponseUsageEvent {
  schemaVersion: 1;
  kind: "response_usage";
  connection: number;
  requestSequence: number | null;
  responseIdHash: string | null;
  /** Только предоставленные непустые строки; null не подтверждает смену routing/model/tier. */
  servedModelHash: string | null;
  servedServiceTierHash: string | null;
  cacheDiagnostics: DiagnosticCacheDiagnostics;
  generation: GenerationKind;
  terminal: "completed" | "failed" | "incomplete";
  correlation: "created_fifo" | "http_single" | "unknown";
  usage: DiagnosticUsage;
}

/** Неполное покрытие не содержит исключений, имён полей или фрагментов исходных данных. */
export interface CoverageEvent {
  schemaVersion: 1;
  kind: "coverage";
  connection: number | null;
  requestSequence: number | null;
  code: DiagnosticCoverageCode;
}

export type DiagnosticEvent =
  | RequestFingerprintEvent
  | SafeResponseCreatedEvent
  | ResponseUsageEvent
  | CoverageEvent;

export interface PendingDiagnosticRequest {
  sequence: number;
  generation: GenerationKind;
}

export interface DiagnosticConnectionState {
  transport: RequestObservationContext["transport"];
  pending: PendingDiagnosticRequest[];
  ambiguous: boolean;
}

export interface DiagnosticResponseBinding extends PendingDiagnosticRequest {
  correlation: "created_fifo" | "http_single";
}

export interface DiagnosticInputHistory {
  sequence: number;
  hashes: string[];
}
