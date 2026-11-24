/**
 * @file .ai/tools/codex-request-diagnostics/test/requestFingerprint.test.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Проверяет отсутствие payload в диагностике, prefix scope, correlation и жёсткие лимиты.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { RequestFingerprintObserver } from "../src/requestFingerprint.service.ts";
import type {
  DiagnosticEvent,
  RequestFingerprintEvent,
} from "../src/requestFingerprint.types.ts";

const key = Buffer.alloc(32, 0xa7);
const headers = {
  "session-id": "SESSION_CANARY",
  authorization: "AUTH_CANARY",
  cookie: "COOKIE_CANARY",
};
const fixture = () => ({
  model: "MODEL_CANARY",
  instructions: "INSTRUCTIONS_CANARY",
  tools: [
    {
      type: "function",
      name: "TOOL_CANARY",
      description: "DESCRIPTION_CANARY",
    },
  ],
  input: [{ role: "user", content: "INPUT_CANARY" }],
  prompt_cache_key: "CACHE_CANARY",
  metadata: { secret: "METADATA_CANARY" },
});

function request(
  observer: RequestFingerprintObserver,
  payload: unknown = fixture(),
  connection = 1,
  transport: "http1" | "http2" | "websocket" = "websocket",
) {
  const event = observer.observeRequest(Buffer.from(JSON.stringify(payload)), {
    transport,
    connection,
    headers,
  });
  assert.equal(event?.kind, "request");
  return event as RequestFingerprintEvent;
}

function created(
  observer: RequestFingerprintObserver,
  id: string,
  connection = 1,
) {
  return observer.observeResponseEvent(
    { type: "response.created", response: { id } },
    connection,
  );
}

function terminal(
  observer: RequestFingerprintObserver,
  id: string,
  usage: unknown = {
    input_tokens: 100,
    input_tokens_details: { cached_tokens: 80 },
    output_tokens: 7,
  },
  connection = 1,
) {
  const event = observer.observeResponseEvent(
    {
      type: "response.completed",
      response: {
        id,
        usage,
        output: "OUTPUT_CANARY",
        reasoning: "REASONING_CANARY",
      },
    },
    connection,
  );
  assert.equal(event?.kind, "response_usage");
  if (event?.kind !== "response_usage") assert.fail("missing_usage_event");
  return event;
}

test("allowlist никогда не выпускает canaries, исходные поля, reasoning или заголовки", () => {
  const observer = new RequestFingerprintObserver(key);
  assert.equal(Object.keys(observer).includes("key"), false);
  assert.equal(JSON.stringify(observer).includes(JSON.stringify(key)), false);
  const payload = {
    ...fixture(),
    UNKNOWN_FIELD_CANARY: "UNKNOWN_VALUE_CANARY",
    input: [{ type: "reasoning", text: "REASONING_CANARY" }],
  };
  const events: (DiagnosticEvent | undefined)[] = [request(observer, payload)];
  created(observer, "RESPONSE_ID_CANARY");
  events.push(terminal(observer, "RESPONSE_ID_CANARY"));
  events.push(
    observer.observeResponseEvent(
      { type: "response.output_text.delta", delta: "OUTPUT_CANARY" },
      1,
    ),
  );
  const output = JSON.stringify(events);
  assert.equal(
    /CANARY|authorization|cookie|UNKNOWN_FIELD|reasoning|MODEL_/u.test(output),
    false,
  );
  const event = events[0] as RequestFingerprintEvent;
  assert.match(event.bodyHash, /^[a-f0-9]{64}$/u);
  assert.match(event.inputItemHashes![0]!, /^[a-f0-9]{64}$/u);
  assert.equal(event.opaqueOptionsCount, 1);
  assert.deepEqual((events[1] as { usage: unknown }).usage, {
    state: "known",
    inputTokens: 100,
    cachedInputTokens: 80,
    outputTokens: 7,
  });
  observer.dispose();
  assert.deepEqual(key, Buffer.alloc(32, 0xa7));
  assert.equal(
    observer.observeRequest(Buffer.from("{}"), {
      transport: "http1",
      connection: 1,
      headers,
    }),
    undefined,
  );
});

test("сериализация и semantic object-key order различаются, arrays и строки не нормализуются", () => {
  const observer = new RequestFingerprintObserver(key);
  const first = request(observer, {
    model: "a",
    input: [{ role: "user", content: "текст\r\n" }],
  });
  const reordered = request(observer, {
    input: [{ content: "текст\r\n", role: "user" }],
    model: "a",
  });
  assert.notEqual(first.bodyHash, reordered.bodyHash);
  assert.equal(first.canonicalBodyHash, reordered.canonicalBodyHash);
  assert.equal(reordered.prefix?.appendOnly, true);
  const changed = request(observer, {
    model: "a",
    input: [{ role: "user", content: "текст\n" }],
  });
  assert.notEqual(first.inputItemHashes![0], changed.inputItemHashes![0]);
  assert.equal(changed.prefix?.commonItems, 0);
});

test("input prefix, перестановки, tools order, options и cache key остаются отдельными signatures", () => {
  const observer = new RequestFingerprintObserver(key);
  const one = request(observer, {
    ...fixture(),
    input: ["a", "b"],
    tools: ["x", "y"],
    temperature: 0,
  });
  const two = request(observer, {
    ...fixture(),
    input: ["a", "b", "c"],
    tools: ["y", "x"],
    temperature: 1,
  });
  assert.deepEqual(two.prefix, {
    comparedRequest: 1,
    commonItems: 2,
    appendOnly: true,
  });
  assert.notEqual(one.toolsHash, two.toolsHash);
  assert.notEqual(one.optionsHash, two.optionsHash);
  const three = request(observer, { ...fixture(), input: ["b", "a", "c"] });
  assert.deepEqual(three.prefix, {
    comparedRequest: 2,
    commonItems: 0,
    appendOnly: false,
  });
  const otherKey = request(observer, {
    ...fixture(),
    prompt_cache_key: "other-key",
  });
  assert.notEqual(otherKey.cacheKeyHash, three.cacheKeyHash);
  assert.equal(otherKey.prefix, null);
});

test("fixed header allowlist исключает auth/cookie, unknown options меняют только безопасные hashes", () => {
  const observer = new RequestFingerprintObserver(key);
  const body = Buffer.from(JSON.stringify(fixture()));
  const observe = (selected: Record<string, string>) =>
    observer.observeRequest(body, {
      transport: "http1",
      connection: 1,
      headers: selected,
    }) as RequestFingerprintEvent;
  const first = observe(headers);
  const otherSecrets = observe({
    ...headers,
    authorization: "other-secret",
    cookie: "other-cookie",
    DYNAMIC_NAME_CANARY: "DYNAMIC_VALUE_CANARY",
  });
  assert.equal(first.headersHash, otherSecrets.headersHash);
  assert.deepEqual(first.affinityHashes, otherSecrets.affinityHashes);
  const changedSession = observe({ ...headers, "session-id": "other-session" });
  assert.notEqual(first.headersHash, changedSession.headersHash);
  const opaque = request(observer, { ...fixture(), PRIVATE_OPTION_CANARY: 1 });
  const opaqueChanged = request(observer, {
    ...fixture(),
    PRIVATE_OPTION_CANARY: 2,
  });
  assert.notEqual(opaque.opaqueOptionsHash, opaqueChanged.opaqueOptionsHash);
  assert.equal(JSON.stringify(opaque).includes("PRIVATE_OPTION_CANARY"), false);
});

test("flat/wrapped WS delta никогда не объявляется полным input или append-only prefix", () => {
  const observer = new RequestFingerprintObserver(key);
  request(observer, { type: "response.create", ...fixture() });
  const delta = request(observer, {
    type: "response.create",
    response: { ...fixture(), previous_response_id: "PREVIOUS_CANARY" },
  });
  assert.equal(delta.inputMode, "delta");
  assert.equal(delta.prefix, null);
  assert.match(delta.continuationIdHash!, /^[a-f0-9]{64}$/u);
  assert.equal(request(observer).prefix, null);
  assert.equal(request(observer).prefix?.appendOnly, true);
  const wrapped = request(observer, {
    type: "response.create",
    response: fixture(),
    OUTER_FIELD_CANARY: 1,
  });
  const changed = request(observer, {
    type: "response.create",
    response: fixture(),
    OUTER_FIELD_CANARY: 2,
  });
  assert.equal(wrapped.opaqueOptionsCount, 1);
  assert.notEqual(wrapped.opaqueOptionsHash, changed.opaqueOptionsHash);
});

test("created связывает ID с request, terminal dedup не считает usage повторно", () => {
  const observer = new RequestFingerprintObserver(key);
  request(observer);
  const acknowledged = created(observer, "resp-1");
  assert.equal(acknowledged?.kind, "response_created");
  assert.equal(
    acknowledged?.kind === "response_created" && acknowledged.requestSequence,
    1,
  );
  assert.equal(created(observer, "resp-1"), undefined);
  const event = terminal(observer, "resp-1");
  assert.equal(event.requestSequence, 1);
  assert.equal(event.correlation, "created_fifo");
  assert.equal(event.generation, "generation");
  assert.equal(
    observer.observeResponseEvent(
      {
        type: "response.completed",
        response: { id: "resp-1", usage: { input_tokens: 100 } },
      },
      1,
    ),
    undefined,
  );
  request(observer);
  created(observer, "resp-2");
  assert.deepEqual(
    terminal(observer, "resp-2", { input_tokens: 100, output_tokens: 1 }).usage,
    { state: "unknown" },
  );
  request(observer);
  created(observer, "resp-3");
  assert.deepEqual(
    terminal(observer, "resp-3", {
      input_tokens: 1,
      input_tokens_details: { cached_tokens: 2 },
      output_tokens: 1,
    }).usage,
    { state: "unknown" },
  );
  assert.equal(terminal(observer, "unmatched").correlation, "unknown");
});

test("prewarm имеет собственную очередь; смешанная неоднозначность не присваивает generation чужой ID", () => {
  const observer = new RequestFingerprintObserver(key);
  const prewarm = request(observer, {
    type: "response.create",
    generate: false,
    ...fixture(),
  });
  assert.equal(prewarm.generation, "prewarm");
  created(observer, "prewarm");
  const warmUsage = terminal(observer, "prewarm", null);
  assert.equal(warmUsage.generation, "prewarm");
  assert.deepEqual(warmUsage.usage, { state: "unknown" });
  assert.equal(request(observer).prefix, null);
  created(observer, "actual");
  assert.equal(terminal(observer, "actual").requestSequence, 2);
  const ambiguous = new RequestFingerprintObserver(key);
  request(ambiguous, { ...fixture(), generate: false });
  request(ambiguous);
  const coverage = created(ambiguous, "ambiguous");
  assert.equal(coverage?.kind, "coverage");
  assert.equal(
    coverage?.kind === "coverage" && coverage.code,
    "prewarm_ambiguous",
  );
  assert.equal(terminal(ambiguous, "ambiguous").requestSequence, null);
});

test("HTTP single response связывается однозначно, multiplexing без created остаётся unknown", () => {
  const observer = new RequestFingerprintObserver(key);
  request(observer, fixture(), 1, "http1");
  const single = observer.observeResponseEvent(
    {
      object: "response",
      status: "completed",
      id: "http",
      usage: {
        input_tokens: 0,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 0,
      },
    },
    1,
  );
  assert.equal(
    single?.kind === "response_usage" && single.correlation,
    "http_single",
  );
  assert.deepEqual(single?.kind === "response_usage" && single.usage, {
    state: "known",
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  });
  request(observer, fixture(), 2, "http2");
  request(observer, fixture(), 2, "http2");
  assert.equal(
    terminal(observer, "multiplex", undefined, 2).requestSequence,
    null,
  );
});

test("typed input parts и tool vectors локализуют drift без исходных ключей и значений", () => {
  const observer = new RequestFingerprintObserver(key);
  const item = {
    type: "message",
    role: "user",
    id: "ID_CANARY",
    call_id: "CALL_CANARY",
    content: "CONTENT_CANARY",
    arguments: "ARGS_CANARY",
    name: "NAME_CANARY",
    output: "OUTPUT_CANARY",
    PRIVATE_METADATA_CANARY: "META_CANARY",
  };
  const first = request(observer, {
    ...fixture(),
    input: [item],
    tools: ["TOOL_A_CANARY", "TOOL_B_CANARY"],
  });
  const identity = request(observer, {
    ...fixture(),
    input: [{ ...item, id: "ID_CHANGED_CANARY" }],
    tools: ["TOOL_B_CANARY", "TOOL_A_CANARY"],
  });
  const content = request(observer, {
    ...fixture(),
    input: [{ ...item, arguments: "ARGS_CHANGED_CANARY" }],
  });
  const metadata = request(observer, {
    ...fixture(),
    input: [{ ...item, PRIVATE_METADATA_CANARY: "META_CHANGED_CANARY" }],
  });
  assert.equal(first.toolCount, 2);
  assert.equal(first.toolItemHashes?.[0], identity.toolItemHashes?.[1]);
  assert.equal(first.toolItemHashes?.[1], identity.toolItemHashes?.[0]);
  assert.notEqual(first.toolsHash, identity.toolsHash);
  const parts = first.inputItemParts![0]!;
  assert.notEqual(
    parts.identityHash,
    identity.inputItemParts![0]!.identityHash,
  );
  assert.equal(parts.contentHash, identity.inputItemParts![0]!.contentHash);
  assert.equal(parts.metadataHash, identity.inputItemParts![0]!.metadataHash);
  assert.equal(parts.identityHash, content.inputItemParts![0]!.identityHash);
  assert.notEqual(parts.contentHash, content.inputItemParts![0]!.contentHash);
  assert.equal(parts.metadataHash, content.inputItemParts![0]!.metadataHash);
  assert.equal(parts.identityHash, metadata.inputItemParts![0]!.identityHash);
  assert.equal(parts.contentHash, metadata.inputItemParts![0]!.contentHash);
  assert.notEqual(
    parts.metadataHash,
    metadata.inputItemParts![0]!.metadataHash,
  );
  assert.equal(
    /CANARY|PRIVATE_METADATA/u.test(
      JSON.stringify([first, identity, content, metadata]),
    ),
    false,
  );
  const absent = request(observer, { input: [] });
  assert.equal(absent.toolCount, null);
  assert.equal(absent.toolItemHashes, null);
  assert.deepEqual(absent.inputItemParts, []);
  const scalar = request(observer, { input: ["SCALAR_CANARY"] });
  assert.match(scalar.inputItemParts![0]!.metadataHash, /^[a-f0-9]{64}$/u);
});

test("served model/tier и official diagnostics используют закрытый hash-only контракт", () => {
  const observer = new RequestFingerprintObserver(key);
  const sent = request(observer, { ...fixture(), service_tier: "TIER_CANARY" });
  created(observer, "metadata-1");
  const complete = (id: string, extra: Record<string, unknown>) => {
    const event = observer.observeResponseEvent(
      {
        type: "response.completed",
        response: {
          id,
          usage: {
            input_tokens: 100,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 1,
          },
          ...extra,
        },
      },
      1,
    );
    if (event?.kind !== "response_usage") assert.fail("missing_metadata_event");
    return event;
  };
  const first = complete("metadata-1", {
    model: fixture().model,
    service_tier: "TIER_CANARY",
    prompt_cache_diagnostics: {
      type: "cache_miss",
      reason: "input_changed",
      cache_missed_tokens: 100,
      comparison_reusable_tokens: 20,
      UNKNOWN_BACKEND_KEY_CANARY: "BACKEND_VALUE_CANARY",
    },
  });
  assert.equal(sent.modelHash, first.servedModelHash);
  assert.equal(sent.serviceTierHash, first.servedServiceTierHash);
  assert.equal(first.cacheDiagnostics.type, "cache_miss");
  assert.equal(first.cacheDiagnostics.reason, "input_changed");
  assert.equal(first.cacheDiagnostics.cacheMissedTokens, 100);
  assert.equal(first.cacheDiagnostics.comparisonReusableTokens, 20);
  assert.match(first.cacheDiagnostics.diagnosticsHash!, /^[a-f0-9]{64}$/u);
  request(observer);
  created(observer, "metadata-2");
  const changed = complete("metadata-2", {
    model: "OTHER_MODEL_CANARY",
    service_tier: "OTHER_TIER_CANARY",
    prompt_cache_diagnostics: {
      type: "UNKNOWN_TYPE_CANARY",
      reason: "OTHER_REASON_CANARY",
      cache_missed_tokens: -1,
      comparison_reusable_tokens: "COUNT_CANARY",
    },
  });
  assert.notEqual(first.servedModelHash, changed.servedModelHash);
  assert.notEqual(first.servedServiceTierHash, changed.servedServiceTierHash);
  assert.notEqual(
    first.cacheDiagnostics.diagnosticsHash,
    changed.cacheDiagnostics.diagnosticsHash,
  );
  assert.equal(changed.cacheDiagnostics.type, "unknown");
  assert.equal(changed.cacheDiagnostics.reason, "unknown");
  assert.equal(changed.cacheDiagnostics.cacheMissedTokens, null);
  assert.equal(changed.cacheDiagnostics.comparisonReusableTokens, null);
  request(observer);
  created(observer, "metadata-3");
  const absent = complete("metadata-3", {});
  assert.equal(absent.servedModelHash, null);
  assert.equal(absent.servedServiceTierHash, null);
  assert.deepEqual(absent.cacheDiagnostics, {
    type: "not_provided",
    reason: "not_provided",
    diagnosticsHash: null,
    cacheMissedTokens: null,
    comparisonReusableTokens: null,
  });
  assert.equal(
    /CANARY|UNKNOWN_BACKEND_KEY/u.test(
      JSON.stringify([first, changed, absent]),
    ),
    false,
  );
  const reasons = [
    "model_changed",
    "prompt_cache_key_changed",
    "service_tier_changed",
    "tools_changed",
    "text_format_changed",
    "reasoning_effort_changed",
    "verbosity_changed",
    "context_compacted",
    "input_changed",
  ];
  for (const [index, reason] of reasons.entries()) {
    const event = complete("reason-" + index, {
      prompt_cache_diagnostics: {
        type: "cache_miss",
        reason,
        cache_missed_tokens: 0,
        comparison_reusable_tokens: 0,
      },
    });
    assert.equal(event.cacheDiagnostics.reason, reason);
    assert.equal(event.cacheDiagnostics.cacheMissedTokens, 0);
  }
  for (const type of [
    "cache_hit",
    "cache_miss",
    "comparison_response_not_found",
    "unavailable",
  ]) {
    const event = complete("type-" + type, {
      prompt_cache_diagnostics: { type },
    });
    assert.equal(event.cacheDiagnostics.type, type);
    assert.equal(event.cacheDiagnostics.reason, "not_provided");
  }
});

test("WS continuation и завершённый response ID имеют один HMAC domain без раскрытия ID", () => {
  const observer = new RequestFingerprintObserver(key);
  request(observer);
  created(observer, "RESPONSE_LINK_CANARY");
  const response = terminal(observer, "RESPONSE_LINK_CANARY");
  const linked = request(observer, {
    ...fixture(),
    previous_response_id: "RESPONSE_LINK_CANARY",
  });
  assert.equal(linked.continuationIdHash, response.responseIdHash);
  assert.equal(linked.inputMode, "delta");
  const other = request(observer, {
    ...fixture(),
    previous_response_id: "OTHER_LINK_CANARY",
  });
  assert.notEqual(other.continuationIdHash, response.responseIdHash);
  assert.equal(request(observer).continuationIdHash, null);
  for (const value of [
    "",
    123,
    { ID_CANARY: "INVALID_CANARY" },
    "x".repeat(1025),
  ]) {
    const invalid = request(observer, {
      ...fixture(),
      previous_response_id: value,
    });
    assert.equal(invalid.continuationIdHash, null);
    assert.equal(invalid.inputMode, "delta");
    assert.equal(JSON.stringify(invalid).includes("CANARY"), false);
  }
});

test("metadata-only prewarm ack доказывает continuation link без fake usage или raw ID", () => {
  const observer = new RequestFingerprintObserver(key);
  request(observer, { ...fixture(), generate: false });
  const ack = created(observer, "PREWARM_ANCESTOR_CANARY");
  if (ack?.kind !== "response_created") assert.fail("missing_created_ack");
  assert.equal(ack.requestSequence, 1);
  assert.equal(ack.generation, "prewarm");
  assert.equal(ack.correlation, "created_fifo");
  assert.equal(Object.hasOwn(ack, "usage"), false);
  const next = request(observer, {
    ...fixture(),
    previous_response_id: "PREWARM_ANCESTOR_CANARY",
  });
  assert.equal(next.continuationIdHash, ack.responseIdHash);
  assert.equal(next.inputMode, "delta");
  created(observer, "GENERATION_CANARY");
  const actualUsage = terminal(observer, "GENERATION_CANARY");
  assert.equal(actualUsage.requestSequence, 2);
  assert.equal(actualUsage.generation, "generation");
  assert.deepEqual(actualUsage.usage, {
    state: "known",
    inputTokens: 100,
    cachedInputTokens: 80,
    outputTokens: 7,
  });
  assert.equal(/CANARY|usage|reasoning/u.test(JSON.stringify(ack)), false);
});

test("presence/toolShape отличают отсутствие от null; client_metadata drift не маскируется opaque options", () => {
  const observer = new RequestFingerprintObserver(key);
  const absent = request(observer, { input: [] });
  assert.deepEqual(absent.presence, {
    model: false,
    instructions: false,
    tools: false,
    prompt_cache_key: false,
    metadata: false,
    client_metadata: false,
  });
  assert.equal(absent.toolShape, "absent");
  assert.equal(absent.toolCount, null);
  const explicit = request(observer, {
    model: null,
    instructions: null,
    tools: null,
    prompt_cache_key: null,
    metadata: null,
    client_metadata: null,
    input: [],
  });
  assert.deepEqual(explicit.presence, {
    model: true,
    instructions: true,
    tools: true,
    prompt_cache_key: true,
    metadata: true,
    client_metadata: true,
  });
  assert.equal(explicit.toolShape, "null");
  assert.notEqual(absent.clientMetadataHash, explicit.clientMetadataHash);
  const empty = request(observer, { input: [], tools: [] });
  assert.equal(empty.toolShape, "array");
  assert.equal(empty.toolCount, 0);
  assert.equal(
    request(observer, {
      input: [],
      tools: { TOOL_REGISTRY_CANARY: "VALUE_CANARY" },
    }).toolShape,
    "object",
  );
  assert.equal(
    request(observer, { input: [], tools: "TOOL_CANARY" }).toolShape,
    "other",
  );
  const one = request(observer, {
    ...fixture(),
    client_metadata: { PRIVATE_CLIENT_CANARY: "VALUE_ONE_CANARY" },
  });
  const two = request(observer, {
    ...fixture(),
    client_metadata: { PRIVATE_CLIENT_CANARY: "VALUE_TWO_CANARY" },
  });
  assert.equal(one.presence.client_metadata, true);
  assert.notEqual(one.clientMetadataHash, two.clientMetadataHash);
  assert.notEqual(one.bodyHash, two.bodyHash);
  assert.notEqual(one.canonicalBodyHash, two.canonicalBodyHash);
  assert.equal(one.opaqueOptionsCount, 0);
  assert.equal(one.opaqueOptionsHash, two.opaqueOptionsHash);
  assert.equal(one.metadataHash, two.metadataHash);
  const wrapped = request(observer, {
    type: "response.create",
    response: fixture(),
    client_metadata: { OUTER_CANARY: "VALUE_CANARY" },
  });
  assert.equal(wrapped.presence.client_metadata, true);
  assert.equal(wrapped.opaqueOptionsCount, 0);
  const body = Buffer.from(
    JSON.stringify({ ...fixture(), client_metadata: { CLIENT_CANARY: true } }),
  );
  const original = Buffer.from(body);
  const event = observer.observeRequest(body, {
    transport: "websocket",
    connection: 1,
    headers,
  });
  assert.deepEqual(body, original);
  assert.equal(
    /CANARY|PRIVATE_CLIENT|OUTER_CANARY/u.test(
      JSON.stringify([one, two, wrapped, event]),
    ),
    false,
  );
});

test("caps, неверный UTF-8 и JSON возвращают только fixed coverage, без raw fallback", () => {
  const context = { transport: "http1" as const, connection: 1, headers };
  const small = new RequestFingerprintObserver(key, { maxBodyBytes: 4 });
  const tooLarge = small.observeRequest(Buffer.from("SECRET_CANARY"), context);
  assert.equal(tooLarge?.kind === "coverage" && tooLarge.code, "body_limit");
  const malformed = new RequestFingerprintObserver(key);
  for (const bytes of [Buffer.from("BROKEN_CANARY"), Buffer.from([0xff])]) {
    const event = malformed.observeRequest(bytes, context);
    assert.equal(event?.kind === "coverage" && event.code, "invalid_json");
    assert.equal(JSON.stringify(event).includes("CANARY"), false);
  }
  const items = new RequestFingerprintObserver(key, { maxItems: 1 });
  const tooMany = items.observeRequest(
    Buffer.from(JSON.stringify({ input: [1, 2] })),
    context,
  );
  assert.equal(tooMany?.kind === "coverage" && tooMany.code, "items_limit");
  const tools = new RequestFingerprintObserver(key, { maxItems: 1 });
  const tooManyTools = tools.observeRequest(
    Buffer.from(
      JSON.stringify({ input: [], tools: ["TOOL_CANARY", "OTHER_CANARY"] }),
    ),
    context,
  );
  assert.equal(
    tooManyTools?.kind === "coverage" && tooManyTools.code,
    "items_limit",
  );
  const bounded = new RequestFingerprintObserver(key, { maxRequests: 1 });
  request(bounded);
  const stopped = bounded.observeRequest(Buffer.from("{}"), context);
  assert.equal(stopped?.kind === "coverage" && stopped.code, "request_limit");
  const events = new RequestFingerprintObserver(key, { maxEvents: 2 });
  request(events);
  const last = events.observeRequest(Buffer.from("{}"), context);
  assert.equal(last?.kind === "coverage" && last.code, "event_limit");
  assert.equal(events.observeRequest(Buffer.from("{}"), context), undefined);
  const correlations = new RequestFingerprintObserver(key, {
    maxCorrelations: 1,
  });
  request(correlations);
  created(correlations, "first");
  terminal(correlations, "first");
  request(correlations);
  const capped = created(correlations, "second");
  assert.equal(capped?.kind === "coverage" && capped.code, "correlation_limit");
  assert.throws(
    () => new RequestFingerprintObserver(key, { maxRequests: 513 }),
    /invalid_diagnostics_limits/u,
  );
});
