/**
 * @file .ai/tools/codex-request-diagnostics/src/requestFingerprint.service.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Получает ограниченные HMAC fingerprints реальных запросов и связывает usage без сохранения payload.
 */
import { createHmac } from "node:crypto";
import type {
  CoverageEvent,
  DiagnosticCacheDiagnostics,
  DiagnosticConnectionState,
  DiagnosticCoverageCode,
  DiagnosticEvent,
  DiagnosticInputHistory,
  DiagnosticInputItemParts,
  DiagnosticResponseBinding,
  DiagnosticUsage,
  GenerationKind,
  RequestFingerprintEvent,
  RequestFingerprintLimits,
  RequestObservationContext,
} from "./requestFingerprint.types.ts";

const HARD_LIMITS: RequestFingerprintLimits = {
  maxRequests: 512,
  maxBodyBytes: 4 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxItems: 1024,
  maxConnections: 64,
  maxCorrelations: 1024,
  maxPendingPerConnection: 16,
  maxCanonicalNodes: 100_000,
  maxEvents: 4096,
};
const OPTION_FIELDS = new Set([
  "tool_choice",
  "parallel_tool_calls",
  "reasoning",
  "text",
  "truncation",
  "max_output_tokens",
  "temperature",
  "top_p",
  "store",
  "stream",
  "include",
  "service_tier",
  "context_management",
  "safety_identifier",
  "prompt_cache_retention",
  "stream_options",
  "generate",
]);
const SEPARATE_FIELDS = new Set([
  "model",
  "instructions",
  "tools",
  "input",
  "prompt_cache_key",
  "metadata",
  "client_metadata",
  "previous_response_id",
  "type",
]);
const IDENTITY_FIELDS = new Set(["type", "role", "id", "call_id"]);
const CONTENT_FIELDS = new Set(["content", "arguments", "name", "output"]);
const CACHE_DIAGNOSTIC_TYPES = new Set<DiagnosticCacheDiagnostics["type"]>([
  "cache_hit",
  "cache_miss",
  "comparison_response_not_found",
  "unavailable",
]);
const CACHE_DIAGNOSTIC_REASONS = new Set<DiagnosticCacheDiagnostics["reason"]>([
  "model_changed",
  "prompt_cache_key_changed",
  "service_tier_changed",
  "tools_changed",
  "text_format_changed",
  "reasoning_effort_changed",
  "verbosity_changed",
  "context_compacted",
  "input_changed",
]);
const HEADER_FIELDS = [
  "session-id",
  "thread-id",
  "x-codex-turn-state",
  "x-codex-routing-hint",
] as const;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Ключ существует только в RAM; каждый компонент получает отдельный HMAC domain. */
export class RequestFingerprintObserver {
  #key: Buffer;
  private readonly limits: RequestFingerprintLimits;
  private readonly connections = new Map<number, DiagnosticConnectionState>();
  private readonly responses = new Map<string, DiagnosticResponseBinding>();
  private readonly completed = new Set<string>();
  private readonly history = new Map<string, DiagnosticInputHistory>();
  private requests = 0;
  private totalBytes = 0;
  private events = 0;
  private disposed = false;

  constructor(key: Buffer, limits: Partial<RequestFingerprintLimits> = {}) {
    if (!Buffer.isBuffer(key) || key.length < 32)
      throw new Error("invalid_diagnostics_key");
    this.#key = Buffer.from(key);
    this.limits = { ...HARD_LIMITS, ...limits };
    for (const name of Object.keys(
      HARD_LIMITS,
    ) as (keyof RequestFingerprintLimits)[])
      if (
        !count(this.limits[name]) ||
        this.limits[name] < 1 ||
        this.limits[name] > HARD_LIMITS[name]
      )
        throw new Error("invalid_diagnostics_limits");
  }

  private emit(event: DiagnosticEvent): DiagnosticEvent | undefined {
    if (this.disposed || this.events >= this.limits.maxEvents) return undefined;
    this.events += 1;
    if (this.events === this.limits.maxEvents)
      return {
        schemaVersion: 1,
        kind: "coverage",
        connection: event.connection,
        requestSequence: null,
        code: "event_limit",
      };
    return event;
  }

  private coverage(
    code: DiagnosticCoverageCode,
    connection: number | null,
    sequence: number | null = null,
  ): DiagnosticEvent | undefined {
    const event: CoverageEvent = {
      schemaVersion: 1,
      kind: "coverage",
      connection,
      requestSequence: sequence,
      code,
    };
    return this.emit(event);
  }

  private digest(domain: string, bytes: string | Buffer): string {
    return createHmac("sha256", this.#key)
      .update(domain)
      .update("\0")
      .update(bytes)
      .digest("hex");
  }

  private canonical(value: unknown): string {
    let nodes = 0;
    const visit = (item: unknown, depth: number): unknown => {
      if (++nodes > this.limits.maxCanonicalNodes || depth > 64)
        throw new Error("canonical_limit");
      if (Array.isArray(item))
        return item.map((entry) => visit(entry, depth + 1));
      if (!record(item)) return item;
      const result = Object.create(null) as Record<string, unknown>;
      for (const key of Object.keys(item).sort())
        result[key] = visit(item[key], depth + 1);
      return result;
    };
    return JSON.stringify(visit(value, 0));
  }

  private valueHash(
    domain: string,
    owner: Record<string, unknown>,
    field: string,
  ): string {
    return this.digest(
      domain,
      this.canonical(
        Object.hasOwn(owner, field)
          ? { present: true, value: owner[field] }
          : { present: false },
      ),
    );
  }

  private itemParts(item: unknown): DiagnosticInputItemParts {
    const identity: Record<string, unknown> = Object.create(null);
    const content: Record<string, unknown> = Object.create(null);
    const metadata: Record<string, unknown> = Object.create(null);
    if (record(item)) {
      for (const field of Object.keys(item)) {
        if (IDENTITY_FIELDS.has(field)) identity[field] = item[field];
        else if (CONTENT_FIELDS.has(field)) content[field] = item[field];
        else metadata[field] = item[field];
      }
    }
    return {
      identityHash: this.digest("input-identity", this.canonical(identity)),
      contentHash: this.digest("input-content", this.canonical(content)),
      metadataHash: this.digest(
        "input-metadata",
        this.canonical(
          record(item)
            ? { kind: "record", value: metadata }
            : { kind: "scalar", value: item },
        ),
      ),
    };
  }

  /** Декодирование кратковременно; наружу не передаются поля или значения исходного объекта. */
  observeRequest(
    body: Buffer,
    context: RequestObservationContext,
  ): DiagnosticEvent | undefined {
    if (this.disposed || this.events >= this.limits.maxEvents) return undefined;
    const connection = count(context.connection) ? context.connection : null;
    if (
      connection === null ||
      !["http1", "http2", "websocket"].includes(context.transport)
    )
      return this.coverage("invalid_context", connection);
    const sequence = ++this.requests;
    if (sequence > this.limits.maxRequests)
      return this.coverage("request_limit", connection, sequence);
    if (!Buffer.isBuffer(body) || body.length > this.limits.maxBodyBytes)
      return this.coverage("body_limit", connection, sequence);
    this.totalBytes += body.length;
    if (this.totalBytes > this.limits.maxTotalBytes)
      return this.coverage("total_bytes_limit", connection, sequence);
    if (!this.connections.has(connection)) {
      if (this.connections.size >= this.limits.maxConnections)
        return this.coverage("connection_limit", connection, sequence);
      this.connections.set(connection, {
        transport: context.transport,
        pending: [],
        ambiguous: false,
      });
    }
    const state = this.connections.get(connection)!;
    if (state.pending.length >= this.limits.maxPendingPerConnection)
      return this.coverage("pending_limit", connection, sequence);
    let envelope: unknown;
    try {
      envelope = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(body),
      );
    } catch {
      return this.coverage("invalid_json", connection, sequence);
    }
    if (
      !record(envelope) ||
      (Object.hasOwn(envelope, "type") && envelope.type !== "response.create")
    )
      return this.coverage("unsupported_request", connection, sequence);
    const wrapped = Object.hasOwn(envelope, "response");
    if (
      wrapped &&
      (envelope.type !== "response.create" || !record(envelope.response))
    )
      return this.coverage("unsupported_request", connection, sequence);
    const payload = wrapped
      ? (envelope.response as Record<string, unknown>)
      : envelope;
    const input = payload.input;
    const tools = Object.hasOwn(payload, "tools") ? payload.tools : undefined;
    if (Array.isArray(tools) && tools.length > this.limits.maxItems)
      return this.coverage("items_limit", connection, sequence);
    if (Array.isArray(input) && input.length > this.limits.maxItems)
      return this.coverage("items_limit", connection, sequence);
    try {
      const selectedHeaders: Record<string, string> = Object.create(null);
      for (const name of Object.keys(context.headers)) {
        const lower = name.toLowerCase();
        if (
          (HEADER_FIELDS as readonly string[]).includes(lower) &&
          typeof context.headers[name] === "string"
        )
          selectedHeaders[lower] = context.headers[name]!;
      }
      const headersHash = this.digest(
        "headers",
        this.canonical(selectedHeaders),
      );
      const affinity = HEADER_FIELDS.map((field) =>
        Object.hasOwn(selectedHeaders, field)
          ? this.digest("header:" + field, selectedHeaders[field]!)
          : null,
      );
      const generate = Object.hasOwn(envelope, "generate")
        ? envelope.generate
        : payload.generate;
      const generation: GenerationKind =
        generate === false
          ? "prewarm"
          : generate === undefined || generate === true
            ? "generation"
            : "unknown";
      const delta =
        payload.previous_response_id !== undefined &&
        payload.previous_response_id !== null;
      const inputMode = delta
        ? "delta"
        : Array.isArray(input)
          ? "full"
          : "unknown";
      const itemHashes = Array.isArray(input)
        ? input.map((item) => this.digest("input-item", this.canonical(item)))
        : null;
      const cacheKeyHash = this.valueHash(
        "cache-key",
        payload,
        "prompt_cache_key",
      );
      const scope = this.digest(
        "history-scope",
        this.canonical([
          Object.hasOwn(payload, "prompt_cache_key") ? cacheKeyHash : null,
          affinity[0],
          affinity[1],
          Object.hasOwn(payload, "prompt_cache_key") ||
          affinity[0] ||
          affinity[1]
            ? null
            : connection,
        ]),
      );
      let prefix: RequestFingerprintEvent["prefix"] = null;
      let nextHistory: DiagnosticInputHistory | null = null;
      if (inputMode === "full" && generation === "generation" && itemHashes) {
        const previous = this.history.get(scope);
        if (previous) {
          let commonItems = 0;
          while (
            commonItems < previous.hashes.length &&
            commonItems < itemHashes.length &&
            previous.hashes[commonItems] === itemHashes[commonItems]
          )
            commonItems++;
          prefix = {
            comparedRequest: previous.sequence,
            commonItems,
            appendOnly:
              commonItems === previous.hashes.length &&
              itemHashes.length >= previous.hashes.length,
          };
        }
        if (
          !this.history.has(scope) &&
          this.history.size >= this.limits.maxConnections
        )
          return this.coverage("connection_limit", connection, sequence);
        nextHistory = { sequence, hashes: itemHashes };
      }
      const options: Record<string, unknown> = Object.create(null);
      const opaque: Record<string, unknown> = Object.create(null);
      const outerOpaque: Record<string, unknown> = Object.create(null);
      for (const field of Object.keys(payload)) {
        if (OPTION_FIELDS.has(field)) options[field] = payload[field];
        else if (!SEPARATE_FIELDS.has(field)) opaque[field] = payload[field];
      }
      if (wrapped) {
        if (Object.hasOwn(envelope, "generate"))
          options.generate = envelope.generate;
        for (const field of Object.keys(envelope))
          if (
            !["type", "response", "generate", "client_metadata"].includes(field)
          )
            outerOpaque[field] = envelope[field];
      }
      const event: RequestFingerprintEvent = {
        schemaVersion: 1,
        kind: "request",
        connection,
        sequence,
        transport: context.transport,
        presence: {
          model: Object.hasOwn(payload, "model"),
          instructions: Object.hasOwn(payload, "instructions"),
          tools: Object.hasOwn(payload, "tools"),
          prompt_cache_key: Object.hasOwn(payload, "prompt_cache_key"),
          metadata: Object.hasOwn(payload, "metadata"),
          client_metadata:
            Object.hasOwn(payload, "client_metadata") ||
            (wrapped && Object.hasOwn(envelope, "client_metadata")),
        },
        toolShape: !Object.hasOwn(payload, "tools")
          ? "absent"
          : tools === null
            ? "null"
            : Array.isArray(tools)
              ? "array"
              : record(tools)
                ? "object"
                : "other",
        generation,
        bodyBytes: body.length,
        bodyHash: this.digest("body", body),
        canonicalBodyHash: this.digest(
          "canonical-body",
          this.canonical(envelope),
        ),
        modelHash: this.valueHash("model", payload, "model"),
        serviceTierHash: this.valueHash(
          "service-tier",
          payload,
          "service_tier",
        ),
        instructionsHash: this.valueHash(
          "instructions",
          payload,
          "instructions",
        ),
        toolsHash: this.valueHash("tools", payload, "tools"),
        toolCount: Array.isArray(tools) ? tools.length : null,
        toolItemHashes: Array.isArray(tools)
          ? tools.map((tool) => this.digest("tool-item", this.canonical(tool)))
          : null,
        optionsHash: this.digest("options", this.canonical(options)),
        opaqueOptionsHash: this.digest(
          "opaque-options",
          this.canonical({ payload: opaque, envelope: outerOpaque }),
        ),
        opaqueOptionsCount:
          Object.keys(opaque).length + Object.keys(outerOpaque).length,
        cacheKeyHash,
        metadataHash: this.valueHash("metadata", payload, "metadata"),
        clientMetadataHash: this.digest(
          "client-metadata",
          this.canonical({
            payload: Object.hasOwn(payload, "client_metadata")
              ? { present: true, value: payload.client_metadata }
              : { present: false },
            envelope:
              wrapped && Object.hasOwn(envelope, "client_metadata")
                ? { present: true, value: envelope.client_metadata }
                : { present: false },
          }),
        ),
        headersHash,
        affinityHashes: {
          sessionIdHash: affinity[0]!,
          threadIdHash: affinity[1]!,
          turnStateHash: affinity[2]!,
          routingHintHash: affinity[3]!,
        },
        inputMode,
        inputItemCount: itemHashes?.length ?? null,
        inputItemHashes: itemHashes,
        inputItemParts: Array.isArray(input)
          ? input.map((item) => this.itemParts(item))
          : null,
        continuationIdHash: delta
          ? this.responseIdHash(payload.previous_response_id)
          : null,
        prefix,
      };
      if (nextHistory) this.history.set(scope, nextHistory);
      else this.history.delete(scope);
      state.pending.push({ sequence, generation });
      return this.emit(event);
    } catch {
      return this.coverage("canonical_limit", connection, sequence);
    }
  }

  private usage(value: unknown): DiagnosticUsage {
    if (
      !record(value) ||
      !count(value.input_tokens) ||
      !count(value.output_tokens)
    )
      return { state: "unknown" };
    const nested = record(value.input_tokens_details)
      ? value.input_tokens_details.cached_tokens
      : undefined;
    const cached = nested ?? value.cached_input_tokens;
    if (
      !count(cached) ||
      cached > value.input_tokens ||
      (nested !== undefined &&
        value.cached_input_tokens !== undefined &&
        nested !== value.cached_input_tokens)
    )
      return { state: "unknown" };
    return {
      state: "known",
      inputTokens: value.input_tokens,
      cachedInputTokens: cached,
      outputTokens: value.output_tokens,
    };
  }

  private responseIdHash(value: unknown): string | null {
    return typeof value === "string" &&
      value.length > 0 &&
      Buffer.byteLength(value) <= 1024
      ? this.digest("response-id", value)
      : null;
  }

  private servedValueHash(
    domain: string,
    response: Record<string, unknown>,
    field: string,
  ): string | null {
    const value = response[field];
    return typeof value === "string" &&
      value.length > 0 &&
      Buffer.byteLength(value) <= 1024
      ? this.valueHash(domain, response, field)
      : null;
  }

  private cacheDiagnostics(
    response: Record<string, unknown>,
  ): DiagnosticCacheDiagnostics {
    const present = ["cache_diagnostics", "prompt_cache_diagnostics"].filter(
      (field) => Object.hasOwn(response, field),
    );
    const result: DiagnosticCacheDiagnostics = {
      type: "not_provided",
      reason: "not_provided",
      diagnosticsHash: null,
      cacheMissedTokens: null,
      comparisonReusableTokens: null,
    };
    if (!present.length) return result;
    result.type = "unknown";
    result.reason = "unknown";
    const opaque: Record<string, unknown> = Object.create(null);
    for (const field of present) opaque[field] = response[field];
    try {
      const text = this.canonical(opaque);
      if (Buffer.byteLength(text) <= this.limits.maxBodyBytes)
        result.diagnosticsHash = this.digest("cache-diagnostics", text);
    } catch {
      /* Не сохраняем исключение или неизвестный backend текст. */
    }
    const diagnostic = response.prompt_cache_diagnostics;
    if (record(diagnostic)) {
      if (count(diagnostic.cache_missed_tokens))
        result.cacheMissedTokens = diagnostic.cache_missed_tokens;
      if (count(diagnostic.comparison_reusable_tokens))
        result.comparisonReusableTokens = diagnostic.comparison_reusable_tokens;
      if (!Object.hasOwn(diagnostic, "type")) result.type = "not_provided";
      else if (
        CACHE_DIAGNOSTIC_TYPES.has(
          diagnostic.type as DiagnosticCacheDiagnostics["type"],
        )
      )
        result.type = diagnostic.type as DiagnosticCacheDiagnostics["type"];
      if (!Object.hasOwn(diagnostic, "reason")) result.reason = "not_provided";
      else if (
        CACHE_DIAGNOSTIC_REASONS.has(
          diagnostic.reason as DiagnosticCacheDiagnostics["reason"],
        )
      )
        result.reason =
          diagnostic.reason as DiagnosticCacheDiagnostics["reason"];
    }
    return result;
  }

  /** Игнорирует текстовые deltas; terminal usage выдаётся один раз по HMAC response ID. */
  observeResponseEvent(
    parsed: unknown,
    connection: number,
  ): DiagnosticEvent | undefined {
    if (
      this.disposed ||
      this.events >= this.limits.maxEvents ||
      !count(connection) ||
      !record(parsed)
    )
      return undefined;
    const bare = parsed.object === "response";
    const type = bare ? "response." + String(parsed.status) : parsed.type;
    if (
      ![
        "response.created",
        "response.completed",
        "response.failed",
        "response.incomplete",
      ].includes(type as string)
    )
      return undefined;
    const response = bare ? parsed : parsed.response;
    if (!record(response)) return this.coverage("response_invalid", connection);
    const id = this.responseIdHash(response.id);
    if (id && this.completed.has(id)) return undefined;
    const state = this.connections.get(connection);
    if (type === "response.created") {
      if (!id) return this.coverage("response_invalid", connection);
      if (this.responses.has(id)) return undefined;
      if (
        this.responses.size + this.completed.size >=
        this.limits.maxCorrelations
      )
        return this.coverage("correlation_limit", connection);
      if (
        state &&
        state.pending.length > 1 &&
        state.pending.some((item) => item.generation === "prewarm")
      ) {
        state.ambiguous = true;
        return this.coverage("prewarm_ambiguous", connection);
      }
      if (state && !state.ambiguous) {
        const pending = state.pending.shift();
        if (pending)
          this.responses.set(id, { ...pending, correlation: "created_fifo" });
      }
      const binding = this.responses.get(id);
      return this.emit({
        schemaVersion: 1,
        kind: "response_created",
        connection,
        requestSequence: binding?.sequence ?? null,
        responseIdHash: id,
        generation: binding?.generation ?? "unknown",
        correlation: binding ? "created_fifo" : "unknown",
      });
    }
    let binding = id ? this.responses.get(id) : undefined;
    if (
      !binding &&
      id &&
      state &&
      !state.ambiguous &&
      state.transport !== "websocket" &&
      state.pending.length === 1
    ) {
      binding = { ...state.pending.shift()!, correlation: "http_single" };
    }
    if (id) {
      if (
        this.responses.size + this.completed.size >=
          this.limits.maxCorrelations &&
        !this.responses.has(id)
      )
        return this.coverage("correlation_limit", connection);
      this.responses.delete(id);
      this.completed.add(id);
    }
    return this.emit({
      schemaVersion: 1,
      kind: "response_usage",
      connection,
      requestSequence: binding?.sequence ?? null,
      responseIdHash: id,
      servedModelHash: this.servedValueHash("model", response, "model"),
      servedServiceTierHash: this.servedValueHash(
        "service-tier",
        response,
        "service_tier",
      ),
      cacheDiagnostics: this.cacheDiagnostics(response),
      generation: binding?.generation ?? "unknown",
      terminal:
        type === "response.completed"
          ? "completed"
          : type === "response.failed"
            ? "failed"
            : "incomplete",
      correlation: binding?.correlation ?? "unknown",
      usage: id ? this.usage(response.usage) : { state: "unknown" },
    });
  }

  /** Завершает жизненный цикл без изменения переданного владельцем cohort ключа. */
  dispose(): void {
    this.#key.fill(0);
    this.connections.clear();
    this.responses.clear();
    this.completed.clear();
    this.history.clear();
    this.disposed = true;
  }
}
