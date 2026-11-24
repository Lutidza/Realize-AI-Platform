/**
 * @file .ai/tools/codex-request-diagnostics/test/applicationStream.test.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Проверяет пассивный HTTP/WS tap, компрессию, границы, canaries и неполное покрытие.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  brotliCompressSync,
  constants,
  createDeflateRaw,
  deflateRawSync,
  gzipSync,
  inflateRawSync,
  zstdCompressSync,
} from "node:zlib";
import { ApplicationStreamTap } from "../src/applicationStream.adapter.ts";
import type {
  ApplicationRequestHeaders,
  ApplicationStreamCoverageCode,
  ApplicationStreamLimits,
} from "../src/applicationStream.types.ts";

const canary = "PRIVATE_TEST_CANARY_ещё_საიდუმლო";

function setup(limits: Partial<ApplicationStreamLimits> = {}) {
  const requests: { body: Buffer; headers: ApplicationRequestHeaders }[] = [];
  const events: unknown[] = [];
  const coverage: ApplicationStreamCoverageCode[] = [];
  const tap = new ApplicationStreamTap(
    {
      request(body, headers) {
        requests.push({ body: Buffer.from(body), headers });
      },
      responseEvent(event) {
        events.push(event);
      },
      coverage(code) {
        coverage.push(code);
      },
    },
    limits,
  );
  return { tap, requests, events, coverage };
}

function feed(
  tap: ApplicationStreamTap,
  direction: "client" | "server",
  bytes: Buffer,
  step = 7,
) {
  const original = Buffer.from(bytes);
  for (let index = 0; index < bytes.length; index += step) {
    if (direction === "client")
      tap.clientData(bytes.subarray(index, index + step));
    else tap.serverData(bytes.subarray(index, index + step));
  }
  assert.deepEqual(bytes, original, "tap must not mutate forwarded bytes");
}

function post(body: Buffer, extra = "") {
  return Buffer.concat([
    Buffer.from(
      `POST /backend-api/codex/responses HTTP/1.1\r\nHost: fixed.test\r\nAuthorization: Bearer ${canary}\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n${extra}\r\n`,
    ),
    body,
  ]);
}

function upgrade(tap: ApplicationStreamTap, extension = "") {
  const header = extension ? `Sec-WebSocket-Extensions: ${extension}\r\n` : "";
  feed(
    tap,
    "client",
    Buffer.from(
      `GET /backend-api/codex/responses HTTP/1.1\r\nHost: fixed.test\r\nUpgrade: websocket\r\nConnection: keep-alive, Upgrade\r\nAuthorization: Bearer ${canary}\r\n${header}\r\n`,
    ),
  );
  feed(
    tap,
    "server",
    Buffer.from(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n${header}\r\n`,
    ),
  );
}

function frame(
  payload: Buffer,
  options: {
    masked?: boolean;
    opcode?: number;
    final?: boolean;
    compressed?: boolean;
  } = {},
) {
  const {
    masked = true,
    opcode = 1,
    final = true,
    compressed = false,
  } = options;
  const lengthBytes =
    payload.length < 126 ? 0 : payload.length <= 65535 ? 2 : 8;
  const header = Buffer.alloc(2 + lengthBytes + (masked ? 4 : 0));
  header[0] = (final ? 0x80 : 0) | (compressed ? 0x40 : 0) | opcode;
  header[1] =
    (masked ? 0x80 : 0) |
    (lengthBytes === 0 ? payload.length : lengthBytes === 2 ? 126 : 127);
  if (lengthBytes === 2) header.writeUInt16BE(payload.length, 2);
  if (lengthBytes === 8) header.writeBigUInt64BE(BigInt(payload.length), 2);
  const body = Buffer.from(payload);
  if (masked) {
    const mask = Buffer.from([7, 19, 23, 31]);
    mask.copy(header, 2 + lengthBytes);
    for (let index = 0; index < body.length; index++)
      body[index] ^= mask[index % 4];
  }
  return Buffer.concat([header, body]);
}

function chunked(body: Buffer) {
  const parts: Buffer[] = [];
  for (let index = 0; index < body.length; index += 13) {
    const part = body.subarray(index, index + 13);
    parts.push(
      Buffer.from(`${part.length.toString(16)};fixture=true\r\n`),
      part,
      Buffer.from("\r\n"),
    );
  }
  parts.push(Buffer.from("0\r\nX-Trailer: bounded\r\n\r\n"));
  return Buffer.concat(parts);
}

async function takeover(messages: Buffer[]) {
  const compressor = createDeflateRaw();
  let chunks: Buffer[] = [];
  const output: Buffer[] = [];
  compressor.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  for (const message of messages) {
    await new Promise<void>((resolve, reject) =>
      compressor.write(message, (error) => (error ? reject(error) : resolve())),
    );
    await new Promise<void>((resolve) =>
      compressor.flush(constants.Z_SYNC_FLUSH, resolve),
    );
    const result = Buffer.concat(chunks);
    assert.deepEqual(result.subarray(-4), Buffer.from([0, 0, 255, 255]));
    output.push(result.subarray(0, -4));
    chunks = [];
  }
  compressor.close();
  return output;
}

test("HTTP1 content-length/chunked сохраняют bytes и отслеживают только Responses", () => {
  const observed = setup();
  const request = Buffer.from(
    JSON.stringify({ model: "fixture", input: canary }),
  );
  feed(
    observed.tap,
    "client",
    Buffer.from("GET /models HTTP/1.1\r\nHost: fixed.test\r\n\r\n"),
    1,
  );
  feed(
    observed.tap,
    "server",
    Buffer.from(
      "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Type: application/json\r\n\r\n{}",
    ),
    1,
  );
  const headers = Buffer.from(
    `POST /responses HTTP/1.1\r\nTransfer-Encoding: chunked\r\nAuthorization: Bearer ${canary}\r\n\r\n`,
  );
  feed(observed.tap, "client", Buffer.concat([headers, chunked(request)]), 1);
  const events = [
    { type: "response.created" },
    { type: "response.completed", response: { usage: { input_tokens: 3 } } },
  ];
  const sse = Buffer.from(
    events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("") +
      "data: [DONE]\r\n\r\n",
  );
  feed(
    observed.tap,
    "server",
    Buffer.concat([
      Buffer.from(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n",
      ),
      chunked(sse),
    ]),
    1,
  );
  observed.tap.endClient();
  observed.tap.endServer();
  assert.equal(observed.requests.length, 1);
  assert.deepEqual(observed.requests[0].body, request);
  assert.equal(observed.requests[0].headers[":method"], "POST");
  assert.equal(observed.requests[0].headers[":path"], "/responses");
  assert.equal(Object.isFrozen(observed.requests[0].headers), true);
  assert.deepEqual(observed.events, events);
  assert.deepEqual(observed.coverage, []);
});

test("HTTP gzip/br/zstd application JSON и gzip SSE декодируются с bounds", () => {
  const codecs = [
    ["gzip", gzipSync],
    ["br", brotliCompressSync],
    ["zstd", zstdCompressSync],
  ] as const;
  for (const [encoding, compress] of codecs) {
    const observed = setup();
    const request = Buffer.from(JSON.stringify({ input: canary }));
    feed(
      observed.tap,
      "client",
      post(compress(request), `Content-Encoding: ${encoding}\r\n`),
      3,
    );
    const event = {
      type: "response.completed",
      response: { usage: { total_tokens: 4 } },
    };
    const compressed = gzipSync(
      Buffer.from(`data: ${JSON.stringify(event)}\n\n`),
    );
    feed(
      observed.tap,
      "server",
      Buffer.concat([
        Buffer.from(
          "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Encoding: gzip\r\nTransfer-Encoding: chunked\r\n\r\n",
        ),
        chunked(compressed),
      ]),
      2,
    );
    assert.deepEqual(observed.requests[0].body, request);
    assert.equal(observed.requests[0].headers["content-encoding"], encoding);
    assert.deepEqual(observed.events, [event]);
    assert.deepEqual(observed.coverage, []);
  }
});

test("HTTP close-delimited response, 100 Continue и несколько SSE data lines", () => {
  const observed = setup();
  const body = Buffer.from('{"input":[]}');
  const wire = post(body);
  const cut = wire.indexOf("\r\n\r\n") + 4;
  feed(observed.tap, "client", wire.subarray(0, cut));
  feed(observed.tap, "server", Buffer.from("HTTP/1.1 100 Continue\r\n\r\n"));
  feed(observed.tap, "client", wire.subarray(cut));
  feed(
    observed.tap,
    "server",
    Buffer.from(
      'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\r\n: heartbeat\r\ndata: {"type":\r\ndata: "response.completed"}\r\n\r\n',
    ),
  );
  assert.deepEqual(observed.events, []);
  observed.tap.endServer();
  assert.deepEqual(observed.events, [{ type: "response.completed" }]);
  assert.deepEqual(observed.coverage, []);
});

test("WS masking, UTF-8 fragmentation, control frames и 16/64-bit lengths", () => {
  const observed = setup();
  upgrade(observed.tap);
  const body = Buffer.from(
    JSON.stringify({ type: "response.create", input: canary }),
  );
  const cut = body.indexOf(Buffer.from("ещё")) + 1;
  feed(
    observed.tap,
    "client",
    Buffer.concat([
      frame(body.subarray(0, cut), { final: false }),
      frame(Buffer.from("ping"), { opcode: 9 }),
      frame(body.subarray(cut), { opcode: 0 }),
    ]),
    1,
  );
  const events = [200, 70_000].map((size) => ({
    type: "response.output_text.delta",
    delta: "x".repeat(size),
  }));
  for (const event of events)
    feed(
      observed.tap,
      "server",
      frame(Buffer.from(JSON.stringify(event)), { masked: false }),
      31,
    );
  feed(
    observed.tap,
    "server",
    frame(Buffer.from("pong"), { masked: false, opcode: 10 }),
  );
  observed.tap.endClient();
  observed.tap.endServer();
  assert.deepEqual(
    observed.requests.map((request) => request.body),
    [body],
  );
  assert.equal(observed.requests[0].headers.upgrade, "websocket");
  assert.deepEqual(observed.events, events);
  assert.deepEqual(observed.coverage, []);
});

test("permessage-deflate сохраняет независимый context takeover обеих сторон", async () => {
  const observed = setup();
  upgrade(
    observed.tap,
    "permessage-deflate; client_max_window_bits=15; server_max_window_bits=15",
  );
  const requests = [1, 2].map((number) =>
    Buffer.from(
      JSON.stringify({
        type: "response.create",
        number,
        input: canary.repeat(200),
      }),
    ),
  );
  const events = [1, 2].map((number) => ({
    type: "response.completed",
    number,
    output: canary.repeat(200),
  }));
  const compressedRequests = await takeover(requests);
  const compressedEvents = await takeover(
    events.map((event) => Buffer.from(JSON.stringify(event))),
  );
  assert.throws(() =>
    inflateRawSync(
      Buffer.concat([compressedRequests[1], Buffer.from([0, 0, 255, 255])]),
      { finishFlush: constants.Z_SYNC_FLUSH },
    ),
  );
  for (let index = 0; index < 2; index++) {
    const compressed = compressedRequests[index],
      cut = Math.floor(compressed.length / 2);
    feed(
      observed.tap,
      "client",
      Buffer.concat([
        frame(compressed.subarray(0, cut), { final: false, compressed: true }),
        frame(Buffer.from("ping"), { opcode: 9 }),
        frame(compressed.subarray(cut), { opcode: 0 }),
      ]),
      1,
    );
    feed(
      observed.tap,
      "server",
      frame(compressedEvents[index], { masked: false, compressed: true }),
      2,
    );
  }
  assert.deepEqual(
    observed.requests.map((request) => request.body),
    requests,
  );
  assert.deepEqual(observed.events, events);
  assert.deepEqual(observed.coverage, []);
});

test("permessage-deflate no_context_takeover и uncompressed message между compressed", async () => {
  for (const noContext of [false, true]) {
    const observed = setup();
    upgrade(
      observed.tap,
      "permessage-deflate" +
        (noContext
          ? "; client_no_context_takeover; server_no_context_takeover"
          : ""),
    );
    const bodies = [
      Buffer.from(JSON.stringify({ input: canary.repeat(100) })),
      Buffer.from(JSON.stringify({ input: canary.repeat(100), next: true })),
    ];
    const compressed = noContext
      ? bodies.map((body) =>
          deflateRawSync(body, {
            finishFlush: constants.Z_SYNC_FLUSH,
          }).subarray(0, -4),
        )
      : await takeover(bodies);
    const plain = Buffer.from('{"type":"response.cancel"}');
    feed(observed.tap, "client", frame(compressed[0], { compressed: true }));
    feed(observed.tap, "client", frame(plain));
    feed(observed.tap, "client", frame(compressed[1], { compressed: true }));
    assert.deepEqual(
      observed.requests.map((request) => request.body),
      [bodies[0], plain, bodies[1]],
    );
    assert.deepEqual(observed.coverage, []);
  }
});

test("неподдержанное и повреждённое покрытие даёт только фиксированный code", () => {
  const cases: [
    ApplicationStreamCoverageCode,
    (tap: ApplicationStreamTap) => void,
    Partial<ApplicationStreamLimits>?,
  ][] = [
    [
      "http1_headers_limit",
      (tap) => tap.clientData(Buffer.from(`GET / HTTP/1.1\r\nX: ${canary}`)),
      { maxHeadersBytes: 10 },
    ],
    [
      "http1_invalid_framing",
      (tap) =>
        tap.clientData(
          Buffer.from(
            "POST /responses HTTP/1.1\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n",
          ),
        ),
    ],
    [
      "http1_body_limit",
      (tap) => tap.clientData(post(Buffer.from('{"x":"long"}'))),
      { maxBodyBytes: 4 },
    ],
    [
      "http1_body_limit",
      (tap) =>
        tap.clientData(
          post(
            gzipSync(Buffer.from(JSON.stringify({ x: canary.repeat(100) }))),
            "Content-Encoding: gzip\r\n",
          ),
        ),
      { maxBodyBytes: 256 },
    ],
    [
      "request_json_invalid",
      (tap) => tap.clientData(post(Buffer.from(canary))),
    ],
    [
      "ws_binary_unsupported",
      (tap) => {
        upgrade(tap);
        tap.clientData(frame(Buffer.from(canary), { opcode: 2 }));
      },
    ],
    [
      "ws_invalid_frame",
      (tap) => {
        upgrade(tap);
        tap.clientData(frame(Buffer.from("{}"), { masked: false }));
      },
    ],
    [
      "ws_compression_unsupported",
      (tap) => {
        upgrade(tap);
        tap.clientData(frame(Buffer.from("{}"), { compressed: true }));
      },
    ],
    [
      "ws_frame_limit",
      (tap) => {
        upgrade(tap);
        tap.clientData(frame(Buffer.alloc(33)));
      },
      { maxFrameBytes: 32 },
    ],
    [
      "ws_message_limit",
      (tap) => {
        upgrade(tap);
        tap.clientData(
          Buffer.concat([
            frame(Buffer.alloc(20), { final: false }),
            frame(Buffer.alloc(20), { opcode: 0 }),
          ]),
        );
      },
      { maxMessageBytes: 32 },
    ],
    [
      "ws_message_limit",
      (tap) => {
        upgrade(tap, "permessage-deflate");
        const body = deflateRawSync(
          Buffer.from(JSON.stringify({ x: "x".repeat(1000) })),
          { finishFlush: constants.Z_SYNC_FLUSH },
        ).subarray(0, -4);
        tap.clientData(frame(body, { compressed: true }));
      },
      { maxMessageBytes: 64 },
    ],
    [
      "ws_count_limit",
      (tap) => {
        upgrade(tap);
        tap.clientData(
          Buffer.concat([
            frame(Buffer.alloc(0), { opcode: 9 }),
            frame(Buffer.alloc(0), { opcode: 9 }),
          ]),
        );
      },
      { maxFrames: 1 },
    ],
    [
      "ws_utf8_invalid",
      (tap) => {
        upgrade(tap);
        tap.clientData(frame(Buffer.from([0xff])));
      },
    ],
    [
      "ws_json_invalid",
      (tap) => {
        upgrade(tap);
        tap.clientData(frame(Buffer.from(canary)));
      },
    ],
    [
      "ws_truncated",
      (tap) => {
        upgrade(tap);
        tap.clientData(frame(Buffer.from("{}"), { final: false }));
        tap.endClient();
      },
    ],
    [
      "http1_truncated",
      (tap) => {
        tap.clientData(
          Buffer.from("POST /responses HTTP/1.1\r\nContent-Length: 4\r\n\r\n{"),
        );
        tap.endClient();
      },
    ],
  ];
  for (const [expected, run, limits] of cases) {
    const observed = setup(limits);
    assert.doesNotThrow(() => run(observed.tap));
    assert.deepEqual(observed.coverage, [expected], expected);
    assert.equal(JSON.stringify(observed.coverage).includes(canary), false);
    observed.tap.clientData(Buffer.from(canary));
    observed.tap.endServer();
    assert.deepEqual(
      observed.coverage,
      [expected],
      "failure emits once and disables only observation",
    );
  }
});

test("callbacks не мутируют forwarded buffers и не бросают секреты в relay", () => {
  const body = Buffer.from(JSON.stringify({ input: canary }));
  const bytes = post(body),
    original = Buffer.from(bytes);
  const coverage: ApplicationStreamCoverageCode[] = [];
  const tap = new ApplicationStreamTap({
    request(captured, headers) {
      assert.equal(Object.isFrozen(headers), true);
      captured.fill(0);
      throw new Error(canary);
    },
    responseEvent() {
      throw new Error(canary);
    },
    coverage(code) {
      coverage.push(code);
      throw new Error(canary);
    },
  });
  assert.doesNotThrow(() => tap.clientData(bytes));
  assert.deepEqual(bytes, original);
  assert.deepEqual(coverage, ["callback_failed"]);
});

test("WS close, negotiated window bits и лимиты message/event проверяются явно", () => {
  const observed = setup();
  upgrade(
    observed.tap,
    'permessage-deflate; client_max_window_bits="10"; server_max_window_bits=10',
  );
  const body = Buffer.from(JSON.stringify({ input: canary.repeat(10) }));
  const compressed = deflateRawSync(body, {
    windowBits: 10,
    finishFlush: constants.Z_SYNC_FLUSH,
  }).subarray(0, -4);
  feed(observed.tap, "client", frame(compressed, { compressed: true }), 1);
  feed(
    observed.tap,
    "server",
    frame(Buffer.from([3, 232]), { masked: false, opcode: 8 }),
    1,
  );
  observed.tap.endServer();
  assert.deepEqual(observed.requests[0].body, body);
  assert.deepEqual(observed.coverage, []);

  const limited = setup({ maxMessages: 1 });
  upgrade(limited.tap);
  feed(
    limited.tap,
    "client",
    Buffer.concat([frame(Buffer.from("{}")), frame(Buffer.from("{}"))]),
  );
  assert.equal(limited.requests.length, 1);
  assert.deepEqual(limited.coverage, ["response_event_limit"]);

  const invalid = setup();
  upgrade(invalid.tap);
  feed(
    invalid.tap,
    "server",
    frame(Buffer.from([3, 237]), { masked: false, opcode: 8 }),
  );
  assert.deepEqual(invalid.coverage, ["ws_invalid_frame"]);

  const pipelined = setup({ maxPendingRequests: 1 });
  feed(
    pipelined.tap,
    "client",
    Buffer.from("GET /models HTTP/1.1\r\n\r\nGET /models HTTP/1.1\r\n\r\n"),
  );
  assert.deepEqual(pipelined.coverage, ["http1_request_count_limit"]);
});
