/**
 * @file .ai/tools/codex-request-diagnostics/test/http2Stream.test.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Проверяет RAM HTTP/2 tap на реальных nghttp2 sessions без сети и изменения frames.
 */
import assert from "node:assert/strict";
import { connect, performServerHandshake } from "node:http2";
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http2";
import { Duplex } from "node:stream";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { gzipSync, zstdCompressSync } from "node:zlib";
import { ApplicationStreamTap } from "../src/applicationStream.adapter.ts";
import { Http2StreamTap } from "../src/http2Stream.adapter.ts";
import type { Http2EofDiagnostics } from "../src/http2Stream.types.ts";
import type {
  ApplicationRequestHeaders,
  ApplicationStreamCoverageCode,
  ApplicationStreamLimits,
} from "../src/applicationStream.types.ts";

const canary = "H2_PRIVATE_CANARY_საიდუმლო_данные";

/** Реальная тестовая пара переносит исходные bytes; observer получает только независимые копии. */
class MemoryWire extends Duplex {
  peer!: MemoryWire;
  observe: (chunk: Buffer) => void = () => {};
  unchanged = true;
  _read(): void {}
  _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    done: (error?: Error | null) => void,
  ): void {
    const before = Buffer.from(chunk);
    this.observe(chunk);
    this.unchanged &&= chunk.equals(before);
    this.peer.push(Buffer.from(chunk));
    done();
  }
}

function pair(
  tap: ApplicationStreamTap,
  handler: (
    headers: IncomingHttpHeaders,
    body: Buffer,
  ) => { headers: OutgoingHttpHeaders; body: Buffer },
) {
  const clientWire = new MemoryWire(),
    serverWire = new MemoryWire();
  clientWire.peer = serverWire;
  serverWire.peer = clientWire;
  clientWire.observe = (chunk) => tap.clientData(chunk);
  serverWire.observe = (chunk) => tap.serverData(chunk);
  const server = performServerHandshake(serverWire, {
    settings: {
      initialWindowSize: 1024 * 1024,
      maxConcurrentStreams: 20,
      headerTableSize: 4096,
    },
  });
  const client = connect("http://fixture.invalid", {
    createConnection: () => clientWire,
  });
  const paths: string[] = [],
    errors: string[] = [];
  server.on("error", () => errors.push("server_error"));
  client.on("error", () => errors.push("client_error"));
  server.on("stream", (stream, headers) => {
    stream.on("error", () => errors.push("real_stream_error"));
    paths.push(String(headers[":path"]));
    const chunks: Buffer[] = [];
    stream.on("data", (data: Buffer) => chunks.push(Buffer.from(data)));
    stream.on("end", () => {
      const response = handler(headers, Buffer.concat(chunks));
      stream.respond({ ":status": 200, ...response.headers });
      stream.end(response.body);
    });
  });
  async function request(headers: OutgoingHttpHeaders, body?: Buffer) {
    const stream = client.request(headers);
    const response: Buffer[] = [];
    const completed = new Promise<Buffer>((resolve, reject) => {
      stream.on("error", reject);
      stream.on("data", (data: Buffer) => response.push(Buffer.from(data)));
      stream.on("end", () => resolve(Buffer.concat(response)));
    });
    stream.end(body);
    return completed;
  }
  async function finish() {
    tap.endClient();
    tap.endServer();
    await tap.finish();
    client.destroy();
    server.destroy();
    clientWire.destroy();
    serverWire.destroy();
    await setImmediate();
    assert.equal(clientWire.unchanged && serverWire.unchanged, true);
  }
  return { client, server, request, finish, paths, errors };
}

function observed(limits: Partial<ApplicationStreamLimits> = {}) {
  const requests: { body: Buffer; headers: ApplicationRequestHeaders }[] = [];
  const events: unknown[] = [],
    coverage: ApplicationStreamCoverageCode[] = [];
  const diagnostics: {
    code: ApplicationStreamCoverageCode;
    http2Eof: Http2EofDiagnostics | undefined;
  }[] = [];
  const tap = new ApplicationStreamTap(
    {
      request(body, headers) {
        requests.push({ body: Buffer.from(body), headers });
      },
      responseEvent(event) {
        events.push(event);
      },
      coverage(code, http2Eof) {
        coverage.push(code);
        diagnostics.push({ code, http2Eof });
      },
    },
    limits,
  );
  return { tap, requests, events, coverage, diagnostics };
}

test("H2 HPACK + large request + gzip SSE декодируются, GET/models не становится request", async () => {
  const capture = observed();
  const event = {
    type: "response.completed",
    response: {
      usage: { input_tokens: 17, input_tokens_details: { cached_tokens: 0 } },
    },
  };
  const sse = gzipSync(Buffer.from(`data: ${JSON.stringify(event)}\n\n`));
  const io = pair(capture.tap, (headers) =>
    headers[":path"] === "/models"
      ? {
          headers: { "content-type": "application/json" },
          body: Buffer.from("{}"),
        }
      : {
          headers: {
            "content-type": "text/event-stream",
            "content-encoding": "gzip",
          },
          body: sse,
        },
  );
  try {
    assert.equal(
      (await io.request({ ":method": "GET", ":path": "/models" })).toString(),
      "{}",
    );
    await capture.tap.flush();
    assert.equal(capture.requests.length, 0);
    const body = Buffer.from(JSON.stringify({ input: canary.repeat(40000) }));
    const actual = await io.request(
      {
        ":method": "POST",
        ":path": "/backend-api/codex/responses",
        authorization: canary,
        "content-type": "application/json",
      },
      body,
    );
    assert.deepEqual(actual, sse);
    await capture.tap.flush();
    assert.deepEqual(capture.coverage, []);
    assert.equal(capture.requests.length, 1);
    assert.deepEqual(capture.requests[0].body, body);
    assert.equal(capture.requests[0].headers[":method"], "POST");
    assert.equal(typeof capture.requests[0].headers[":scheme"], "string");
    assert.equal(Object.isFrozen(capture.requests[0].headers), true);
    assert.deepEqual(capture.events, [event]);
    assert.deepEqual(io.paths, ["/models", "/backend-api/codex/responses"]);
    assert.deepEqual(io.errors, []);
  } finally {
    await io.finish();
  }
  assert.deepEqual(capture.coverage, []);
});

test("H2 flush не закрывает connection между phases, SETTINGS и parallel stream IDs сохраняются", async () => {
  const capture = observed();
  const io = pair(capture.tap, (_headers, body) => ({
    headers: { "content-type": "application/json" },
    body: Buffer.from(
      JSON.stringify({ type: "response.completed", bytes: body.length }),
    ),
  }));
  try {
    for (let phase = 0; phase < 3; phase++) {
      io.server.settings({ headerTableSize: 512 + phase * 128 });
      io.client.settings({ headerTableSize: 1024 + phase * 128 });
      await Promise.all(
        [1, 2].map((number) =>
          io.request(
            {
              ":method": "POST",
              ":path": "/responses",
              "content-type": "application/json",
              "x-hpack-fixture": canary,
            },
            Buffer.from(JSON.stringify({ phase, number })),
          ),
        ),
      );
      await capture.tap.flush();
      assert.equal(capture.requests.length, (phase + 1) * 2);
      assert.equal(capture.events.length, (phase + 1) * 2);
      assert.deepEqual(capture.coverage, []);
      assert.equal(io.client.destroyed, false);
    }
  } finally {
    await io.finish();
  }
  assert.deepEqual(capture.coverage, []);
});

test("H2 zstd request bytes и observer callback failure не меняют реальный reply", async () => {
  const coverage: ApplicationStreamCoverageCode[] = [];
  let captured: Buffer | null = null;
  const reply = Buffer.from('{"type":"response.completed"}');
  const tap = new ApplicationStreamTap({
    request(body) {
      captured = Buffer.from(body);
      body.fill(0);
      throw new Error(canary);
    },
    responseEvent() {},
    coverage(code) {
      coverage.push(code);
    },
  });
  const io = pair(tap, () => ({
    headers: { "content-type": "application/json" },
    body: reply,
  }));
  const body = Buffer.from(JSON.stringify({ input: canary }));
  try {
    assert.deepEqual(
      await io.request(
        {
          ":method": "POST",
          ":path": "/responses",
          "content-type": "application/json",
          "content-encoding": "zstd",
        },
        zstdCompressSync(body),
      ),
      reply,
    );
    await tap.flush();
    assert.deepEqual(captured, body);
    assert.deepEqual(coverage, ["callback_failed"]);
    assert.equal(JSON.stringify(coverage).includes(canary), false);
  } finally {
    await io.finish();
  }
});

test("H2 framing/count bounds и неполный preface дают только fixed coverage", async () => {
  const preface = Buffer.from("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n");
  for (const mode of ["frame", "invalid", "truncated"] as const) {
    const codes: string[] = [];
    const diagnostics: (Http2EofDiagnostics | undefined)[] = [];
    const tap = new Http2StreamTap(
      {
        request() {},
        response() {},
        coverage(code, http2Eof) {
          codes.push(code);
          diagnostics.push(http2Eof);
        },
      },
      { maxFrameBytes: 32 },
    );
    if (mode === "frame") {
      const header = Buffer.alloc(9);
      header.writeUIntBE(33, 0, 3);
      tap.clientData(Buffer.concat([preface, header]));
    } else if (mode === "invalid") tap.clientData(Buffer.from(canary));
    else tap.clientData(preface.subarray(0, 12));
    tap.endClient();
    tap.endServer();
    await tap.finish();
    assert.deepEqual(codes, [
      mode === "frame"
        ? "http2_frame_limit"
        : mode === "invalid"
          ? "http2_invalid_preface"
          : "http2_truncated",
    ]);
    if (mode === "truncated") {
      assert.equal(diagnostics[0]?.gotPreface, false);
      assert.equal(diagnostics[0]?.clientBufferBytes, 12);
      assert.equal(diagnostics[0]?.clientSettings, false);
      assert.equal(diagnostics[0]?.serverSettings, false);
      assert.equal(diagnostics[0]?.decodedModelStreams, 0);
      assert.equal(Object.isFrozen(diagnostics[0]), true);
    } else assert.deepEqual(diagnostics, [undefined]);
  }
});

test("H2 EOF отличает незавершённый nonmodel stream от model loss и неизвестного wire tail", async () => {
  for (const mode of [
    "background",
    "missing-ends",
    "model-response",
    "model-request",
    "wire-tail",
    "server-queue",
  ] as const) {
    const capture = observed();
    const clientWire = new MemoryWire(),
      serverWire = new MemoryWire();
    clientWire.peer = serverWire;
    serverWire.peer = clientWire;
    clientWire.observe = (bytes) => capture.tap.clientData(bytes);
    serverWire.observe = (bytes) => capture.tap.serverData(bytes);
    const server = performServerHandshake(serverWire);
    const client = connect("http://fixture.invalid", {
      createConnection: () => clientWire,
    });
    const errors: string[] = [];
    server.on("error", () => errors.push("server_error"));
    client.on("error", () => errors.push("client_error"));
    server.on("stream", (stream) => {
      stream.on("error", () => {});
      stream.resume();
      stream.respond({ ":status": 200, "content-type": "application/json" });
      if (mode === "model-request") stream.end('{"type":"response.completed"}');
      else stream.write('{"unfinished":');
    });
    const model = mode.startsWith("model-");
    const request = client.request(
      {
        ":method": model ? "POST" : "GET",
        ":path": model ? "/responses" : "/models",
      },
      { endStream: false },
    );
    request.on("error", () => {});
    const responseSeen = new Promise<void>((resolve) => {
      request.once("data", () => resolve());
    });
    request.resume();
    if (mode === "model-request") request.write('{"input":[');
    else request.end(model ? '{"input":[]}' : undefined);
    try {
      await responseSeen;
      await capture.tap.flush();
      assert.deepEqual(capture.coverage, [], mode);
      if (mode === "wire-tail") capture.tap.serverData(Buffer.from([0]));
      if (mode === "server-queue") {
        const unknownStream = Buffer.alloc(9);
        unknownStream[3] = 1;
        unknownStream[4] = 4;
        unknownStream.writeUInt32BE(3, 5);
        capture.tap.serverData(unknownStream);
      }
      if (mode !== "missing-ends") {
        capture.tap.endClient();
        capture.tap.endServer();
      }
      await capture.tap.finish();
      assert.deepEqual(
        capture.coverage,
        mode === "background"
          ? []
          : [
              mode === "server-queue"
                ? "http2_drain_incomplete"
                : "http2_truncated",
            ],
        mode,
      );
      assert.equal(capture.requests.length, mode === "model-response" ? 1 : 0);
      if (mode === "background") assert.deepEqual(capture.diagnostics, []);
      else if (mode === "server-queue")
        assert.deepEqual(capture.diagnostics, [
          { code: "http2_drain_incomplete", http2Eof: undefined },
        ]);
      else {
        const http2Eof = capture.diagnostics[0]?.http2Eof;
        assert.deepEqual(http2Eof, {
          clientEnded: mode !== "missing-ends",
          serverEnded: mode !== "missing-ends",
          gotPreface: true,
          clientSettings: true,
          serverSettings: true,
          clientHeaderPending: false,
          serverHeaderPending: false,
          clientBufferBytes: 0,
          serverBufferBytes: mode === "wire-tail" ? 1 : 0,
          serverQueueFrames: 0,
          decodedModelStreams: model ? 1 : 0,
          decodedNonmodelStreams: model ? 0 : 1,
          unfinishedModelRequests: mode === "model-request" ? 1 : 0,
          unfinishedModelResponses: mode === "model-response" ? 1 : 0,
          unknownExpectedStreams: 0,
        });
        assert.equal(Object.isFrozen(http2Eof), true);
        assert.ok(
          Object.values(http2Eof!).every(
            (value) =>
              typeof value === "boolean" ||
              (Number.isSafeInteger(value) && Number(value) >= 0),
          ),
        );
        assert.equal(JSON.stringify(http2Eof).includes(canary), false);
      }
      assert.deepEqual(
        capture.events,
        mode === "model-request" ? [{ type: "response.completed" }] : [],
        mode,
      );
      assert.deepEqual(errors, [], mode);
    } finally {
      await capture.tap.finish();
      client.destroy();
      server.destroy();
      clientWire.destroy();
      serverWire.destroy();
    }
    assert.equal(clientWire.unchanged && serverWire.unchanged, true, mode);
  }
});

test("H2 CONTINUATION, trailers и потоковое дробление не теряют headers/data", async () => {
  const capture = observed();
  const clientWire = new MemoryWire(),
    serverWire = new MemoryWire();
  clientWire.peer = serverWire;
  serverWire.peer = clientWire;
  const split = (direction: "client" | "server", bytes: Buffer) => {
    for (let index = 0; index < bytes.length; index += 3) {
      if (direction === "client")
        capture.tap.clientData(bytes.subarray(index, index + 3));
      else capture.tap.serverData(bytes.subarray(index, index + 3));
    }
  };
  clientWire.observe = (bytes) => split("client", bytes);
  serverWire.observe = (bytes) => split("server", bytes);
  const server = performServerHandshake(serverWire);
  const client = connect("http://fixture.invalid", {
    createConnection: () => clientWire,
  });
  const errors: string[] = [];
  server.on("error", () => errors.push("server_error"));
  client.on("error", () => errors.push("client_error"));
  server.on("stream", (stream) => {
    stream.on("error", () => errors.push("stream_error"));
    stream.resume();
    stream.on("end", () => {
      stream.respond(
        { ":status": 200, "content-type": "application/json" },
        { waitForTrailers: true },
      );
      stream.on("wantTrailers", () =>
        stream.sendTrailers({ "x-trailer": "done" }),
      );
      stream.end('{"type":"response.completed"}');
    });
  });
  try {
    const long = "abcdefghijklmnopqrstuvwxyz".repeat(1900);
    const request = client.request(
      {
        ":method": "POST",
        ":path": "/responses",
        "content-type": "application/json",
        "x-long-hpack": long,
      },
      { waitForTrailers: true },
    );
    const ended = new Promise<void>((resolve, reject) => {
      request.on("error", reject);
      request.resume();
      request.on("end", resolve);
    });
    request.on("wantTrailers", () =>
      request.sendTrailers({ "x-request-trailer": "done" }),
    );
    request.end('{"input":[]}');
    await ended;
    await capture.tap.flush();
    assert.equal(capture.requests.length, 1);
    assert.equal(capture.requests[0].headers["x-long-hpack"], long);
    assert.deepEqual(capture.events, [{ type: "response.completed" }]);
    assert.deepEqual(capture.coverage, []);
    assert.deepEqual(errors, []);
  } finally {
    capture.tap.endClient();
    capture.tap.endServer();
    await capture.tap.finish();
    client.destroy();
    server.destroy();
    clientWire.destroy();
    serverWire.destroy();
  }
  assert.equal(clientWire.unchanged && serverWire.unchanged, true);
  assert.deepEqual(capture.coverage, []);
});

test("H2 body/stream limits отключают observer, сохраняя реальные ответы", async () => {
  for (const mode of ["body", "streams"] as const) {
    const capture = observed(
      mode === "body" ? { maxBodyBytes: 128 } : { maxPendingRequests: 1 },
    );
    const reply = Buffer.from('{"type":"response.completed"}');
    const io = pair(capture.tap, () => ({
      headers: { "content-type": "application/json" },
      body: reply,
    }));
    try {
      if (mode === "body") {
        const body = Buffer.from(JSON.stringify({ input: canary.repeat(100) }));
        assert.deepEqual(
          await io.request({ ":method": "POST", ":path": "/responses" }, body),
          reply,
        );
      } else {
        await io.request({ ":method": "GET", ":path": "/models" });
        await io.request({ ":method": "GET", ":path": "/models" });
      }
      await capture.tap.flush();
      assert.deepEqual(capture.coverage, [
        mode === "body" ? "http2_body_limit" : "http2_stream_limit",
      ]);
    } finally {
      await io.finish();
    }
  }
});

test("reordered H2 responses сохраняют native stream correlation для SSE и JSON", async () => {
  const requests = new Map<string, string>();
  const responses: { label: string; stream: string | undefined }[] = [];
  const coverage: ApplicationStreamCoverageCode[] = [];
  let markSecondObserved!: () => void;
  const secondObserved = new Promise<void>((resolve) => {
    markSecondObserved = resolve;
  });
  const tap = new ApplicationStreamTap({
    request(body, headers) {
      requests.set(
        headers[":diagnostic-stream-id"],
        JSON.parse(body.toString()).label,
      );
      assert.equal(Object.isFrozen(headers), true);
    },
    responseEvent(value, headers) {
      responses.push({
        label: (value as { label: string }).label,
        stream: headers?.[":diagnostic-stream-id"],
      });
      assert.equal(Object.isFrozen(headers), true);
      if ((value as { label: string }).label === "second") markSecondObserved();
    },
    coverage(code) {
      coverage.push(code);
    },
  });
  const clientWire = new MemoryWire(),
    serverWire = new MemoryWire();
  clientWire.peer = serverWire;
  serverWire.peer = clientWire;
  clientWire.observe = (bytes) => tap.clientData(bytes);
  serverWire.observe = (bytes) => tap.serverData(bytes);
  const server = performServerHandshake(serverWire);
  const client = connect("http://fixture.invalid", {
    createConnection: () => clientWire,
  });
  const errors: string[] = [];
  server.on("error", () => errors.push("server_error"));
  client.on("error", () => errors.push("client_error"));
  const completed: {
    stream: import("node:http2").ServerHttp2Stream;
    label: string;
  }[] = [];
  server.on("stream", (stream, headers) => {
    assert.equal(Object.hasOwn(headers, ":diagnostic-stream-id"), false);
    const chunks: Buffer[] = [];
    stream.on("error", () => errors.push("real_stream_error"));
    stream.on("data", (bytes: Buffer) => chunks.push(Buffer.from(bytes)));
    stream.on("end", () => {
      completed.push({
        stream,
        label: JSON.parse(Buffer.concat(chunks).toString()).label,
      });
      if (completed.length !== 2) return;
      const first = completed.find((entry) => entry.label === "first")!;
      const second = completed.find((entry) => entry.label === "second")!;
      second.stream.respond({
        ":status": 200,
        "content-type": "text/event-stream",
      });
      second.stream.end(
        'data: {"type":"response.completed","label":"second"}\n\n',
      );
      void secondObserved.then(() => {
        first.stream.respond({
          ":status": 200,
          "content-type": "application/json",
        });
        first.stream.end('{"type":"response.completed","label":"first"}');
      });
    });
  });
  try {
    await Promise.all(
      ["first", "second"].map(
        (label) =>
          new Promise<void>((resolve, reject) => {
            const stream = client.request({
              ":method": "POST",
              ":path": "/responses",
              "content-type": "application/json",
            });
            stream.on("error", reject);
            stream.resume();
            stream.on("end", resolve);
            stream.end(JSON.stringify({ label }));
          }),
      ),
    );
    await tap.flush();
    assert.deepEqual(
      responses.map((response) => response.label),
      ["second", "first"],
    );
    assert.deepEqual(
      responses.map((response) => requests.get(response.stream!)),
      ["second", "first"],
    );
    assert.deepEqual(
      responses.map((response) => response.stream),
      ["3", "1"],
    );
    assert.deepEqual(coverage, []);
    assert.deepEqual(errors, []);
  } finally {
    tap.endClient();
    tap.endServer();
    await tap.finish();
    client.destroy();
    server.destroy();
    clientWire.destroy();
    serverWire.destroy();
  }
  assert.equal(clientWire.unchanged && serverWire.unchanged, true);
  assert.deepEqual(coverage, []);
});
