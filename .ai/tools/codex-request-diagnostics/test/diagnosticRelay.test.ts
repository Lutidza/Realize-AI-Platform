/**
 * @file .ai/tools/codex-request-diagnostics/test/diagnosticRelay.test.ts
 * @version 1.0.0
 * @date 2026-11-20
 * @description Проверяет CONNECT, TLS trust/ALPN, bounded pre-application retry и неизменность application bytes.
 */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { Duplex } from "node:stream";
import { createServer, connect } from "node:tls";
import { createSecureServer, connect as connectHttp2 } from "node:http2";
import { readFile, readdir, access } from "node:fs/promises";
import { dirname } from "node:path";
import { createEphemeralCertificate } from "../src/createEphemeralCertificate.adapter.ts";
import { startDiagnosticRelay } from "../src/diagnosticRelay.adapter.ts";
import { RequestFingerprintObserver } from "../src/requestFingerprint.service.ts";
import { X509Certificate } from "node:crypto";
import type {
  DiagnosticRelay,
  RelayCoverageCode,
  RelayUpstreamAttempt,
  RelayUpstreamFailure,
} from "../src/diagnosticRelay.types.ts";
import type { TLSSocket } from "node:tls";
import type { Socket } from "node:net";

async function tunnel(
  relay: DiagnosticRelay,
  authority = "chatgpt.com:443",
  authenticate = true,
) {
  const proxy = new URL(relay.childEnvironment.HTTPS_PROXY);
  return new Promise<import("node:stream").Duplex>((resolve, reject) => {
    const req = request({
      hostname: proxy.hostname,
      port: proxy.port,
      method: "CONNECT",
      path: authority,
      headers: authenticate
        ? {
            "Proxy-Authorization": `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}`,
          }
        : {},
    });
    req.on("connect", (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error("tunnel_rejected"));
        return;
      }
      if (head.length) socket.unshift(head);
      resolve(socket);
    });
    req.on("error", () => reject(new Error("tunnel_rejected")));
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("tunnel_timeout"));
    });
    req.end();
  });
}

test("CONNECT relay сохраняет байты, Host/SNI и ALPN; файлы содержат только публичный сертификат", async (t) => {
  const fixture = await createEphemeralCertificate();
  assert.equal(new X509Certificate(fixture.certificate).ca, false);
  assert.equal(new X509Certificate(fixture.trustCertificate).ca, true);
  const application = Buffer.from(
    'POST /backend-api/codex/responses HTTP/1.1\r\nHost: chatgpt.com\r\nAuthorization: Bearer CANARY_SECRET\r\nsession-id: CANARY_SESSION\r\nContent-Type: application/json\r\nContent-Length: 39\r\n\r\n{"model":"fixture","input":[],"x":null}',
  );
  const response = Buffer.from(
    'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {"type":"response.completed","response":{"id":"fixture","usage":{"input_tokens":1,"input_tokens_details":{"cached_tokens":0},"output_tokens":0}}}\n\n',
  );
  const received: Buffer[] = [];
  const peers = new Set<TLSSocket>();
  const origin = createServer(
    {
      key: fixture.privateKey,
      cert: fixture.certificate,
      ALPNProtocols: ["http/1.1"],
    },
    (socket) => {
      peers.add(socket);
      socket.on("error", () => {});
      socket.once("close", () => peers.delete(socket));
      socket.on("data", (chunk: Buffer) => {
        received.push(Buffer.from(chunk));
        if (Buffer.concat(received).length >= application.length)
          socket.end(response);
      });
    },
  );
  await new Promise<void>((resolve) => origin.listen(0, "127.0.0.1", resolve));
  const address = origin.address();
  assert.ok(address && typeof address !== "string");
  let observedRequests = 0;
  let observedResponses = 0;
  const coverage: string[] = [];
  const relay = await startDiagnosticRelay({
    connectUpstream(host, protocols) {
      assert.ok(host === "chatgpt.com");
      return connect({
        host: "127.0.0.1",
        port: address.port,
        servername: host,
        ca: fixture.certificate,
        ALPNProtocols: [...protocols],
      });
    },
    request(body, context) {
      observedRequests++;
      assert.ok(context.headers.host === "chatgpt.com");
      assert.ok(body.includes('"model":"fixture"'));
    },
    responseEvent() {
      observedResponses++;
    },
    coverage(code) {
      coverage.push(code);
    },
  });
  t.after(async () => {
    await relay.close();
    for (const peer of peers) peer.destroy();
    await new Promise<void>((resolve) => origin.close(() => resolve()));
    fixture.privateKey.fill(0);
    // Поздние EOF events после close обязаны входить в результат, а не теряться после assertions.
    assert.deepEqual(coverage, []);
  });

  assert.ok(!JSON.stringify(relay).includes("diagnostic:"));
  assert.deepEqual(await readdir(dirname(relay.publicCertificatePath)), [
    "public-ca.pem",
  ]);
  const ca = await readFile(relay.publicCertificatePath);
  assert.ok(ca.includes("BEGIN CERTIFICATE") && !ca.includes("PRIVATE KEY"));
  const socket = connect({
    socket: await tunnel(relay),
    servername: "chatgpt.com",
    ca,
    ALPNProtocols: ["http/1.1"],
  });
  const receivedResponse: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    socket.on("error", reject);
    socket.on("data", (part: Buffer) =>
      receivedResponse.push(Buffer.from(part)),
    );
    socket.once("end", resolve);
    socket.once("secureConnect", () => {
      assert.ok(socket.authorized && socket.alpnProtocol === "http/1.1");
      socket.write(application.subarray(0, 30));
      socket.write(application.subarray(30));
    });
    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(
        new Error(
          `fixture_timeout bytes=${Buffer.concat(received).length} coverage=${coverage.join(",")}`,
        ),
      );
    });
  });
  assert.ok(Buffer.concat(received).equals(application));
  assert.ok(Buffer.concat(receivedResponse).equals(response));
  assert.equal(observedRequests, 1);
  assert.equal(observedResponses, 1);
  assert.deepEqual(coverage, []);
  await relay.close();
  await assert.rejects(access(relay.publicCertificatePath));
});

test("relay отклоняет анонимный CONNECT и чужое назначение без upstream dial", async (t) => {
  let dials = 0;
  const rejections: number[] = [],
    gaps: string[] = [];
  const relay = await startDiagnosticRelay({
    connectUpstream() {
      dials++;
      throw new Error("unexpected_dial");
    },
    request() {},
    responseEvent() {},
    coverage(code) {
      gaps.push(code);
    },
    policyRejection(connection) {
      rejections.push(connection);
    },
  });
  t.after(() => relay.close());
  await assert.rejects(tunnel(relay, "chatgpt.com:443", false));
  await assert.rejects(tunnel(relay, "example.invalid:443"));
  assert.equal(dials, 0);
  assert.equal(rejections.length, 1);
  assert.deepEqual(gaps, []);
  assert.equal(relay.snapshot().clientApplicationBytes, 0);
  assert.equal(relay.snapshot().serverApplicationBytes, 0);
});

test("relay допускает 128 последовательных authenticated CONNECT и отклоняет 129-й до upstream dial", async (t) => {
  let dials = 0;
  const gaps: { code: string; connection: number }[] = [];
  const relay = await startDiagnosticRelay({
    connectUpstream() {
      dials++;
      throw new Error("unexpected_dial");
    },
    request() {
      assert.fail("unexpected_application_request");
    },
    responseEvent() {
      assert.fail("unexpected_application_response");
    },
    coverage(code, connection) {
      gaps.push({ code, connection });
    },
  });
  t.after(() => relay.close());
  for (let connection = 1; connection <= 128; connection++) {
    const socket = (await tunnel(relay)) as Socket;
    assert.equal(relay.snapshot().connections, connection);
    if (connection === 65 || connection === 66) assert.deepEqual(gaps, []);
    // RST закрывает обе стороны без TLS ClientHello и не оставляет half-open socket.
    await new Promise<void>((resolve) => {
      socket.once("close", resolve);
      socket.resetAndDestroy();
    });
  }
  assert.deepEqual(gaps, []);
  await assert.rejects(tunnel(relay));
  assert.deepEqual(gaps, [
    { code: "connection_budget_exceeded", connection: 129 },
  ]);
  assert.equal(dials, 0);
  assert.deepEqual(relay.snapshot(), {
    connections: 129,
    tlsEstablished: 0,
    upstreamDials: 0,
    upstreamRetryDials: 0,
    upstreamRecoveries: 0,
    clientApplicationBytes: 0,
    serverApplicationBytes: 0,
  });
  await relay.close();
  assert.deepEqual(gaps, [
    { code: "connection_budget_exceeded", connection: 129 },
  ]);
});

test("relay сохраняет отдельный предел 64 одновременно открытых owned sockets", async (t) => {
  let dials = 0;
  const gaps: { code: string; connection: number }[] = [];
  const relay = await startDiagnosticRelay({
    connectUpstream() {
      dials++;
      throw new Error("unexpected_dial");
    },
    request() {},
    responseEvent() {},
    coverage(code, connection) {
      gaps.push({ code, connection });
    },
  });
  const sockets: Socket[] = [];
  t.after(async () => {
    for (const socket of sockets) socket.resetAndDestroy();
    await relay.close();
  });
  for (let connection = 0; connection < 64; connection++)
    sockets.push((await tunnel(relay)) as Socket);
  assert.deepEqual(gaps, []);
  await assert.rejects(tunnel(relay));
  assert.deepEqual(gaps, [
    { code: "connection_budget_exceeded", connection: 0 },
  ]);
  assert.equal(relay.snapshot().connections, 64);
  assert.equal(dials, 0);
});

test("HTTP2 через TLS relay сохраняет authority и коррелирует переставленные streams раздельно", async (t) => {
  const fixture = await createEphemeralCertificate();
  const observer = new RequestFingerprintObserver(Buffer.alloc(32, 23));
  const events: {
    stream: number | undefined;
    channel: number;
    sequence?: number | null;
    kind: string;
  }[] = [];
  const coverage: string[] = [];
  const peers = new Set<TLSSocket>();
  const streams: import("node:http2").ServerHttp2Stream[] = [];
  const origin = createSecureServer({
    key: fixture.privateKey,
    cert: fixture.certificate,
  });
  origin.on("secureConnection", (socket) => peers.add(socket));
  origin.on("stream", (stream, headers) => {
    assert.ok(headers[":authority"] === "chatgpt.com");
    assert.ok(headers[":diagnostic-stream-id"] === undefined);
    stream.on("data", () => {});
    stream.on("end", () => {
      streams.push(stream as import("node:http2").ServerHttp2Stream);
      if (streams.length !== 2) return;
      for (const target of [...streams].sort((a, b) => b.id! - a.id!)) {
        target.respond({ ":status": 200, "content-type": "text/event-stream" });
        target.end(
          `data: ${JSON.stringify({ type: "response.completed", response: { id: `fixture-${target.id}`, usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1 } } })}\n\n`,
        );
      }
    });
  });
  await new Promise<void>((resolve) => origin.listen(0, "127.0.0.1", resolve));
  const address = origin.address();
  assert.ok(address && typeof address !== "string");
  const relay = await startDiagnosticRelay({
    connectUpstream(host, protocols) {
      return connect({
        host: "127.0.0.1",
        port: address.port,
        servername: host,
        ca: fixture.certificate,
        ALPNProtocols: [...protocols],
      });
    },
    request(body, context) {
      const event = observer.observeRequest(body, context);
      if (event)
        events.push({
          kind: event.kind,
          channel: context.connection,
          stream: context.streamIndex,
          sequence: event.kind === "request" ? event.sequence : null,
        });
    },
    responseEvent(value, channel, _physical, stream) {
      const event = observer.observeResponseEvent(value, channel);
      if (event)
        events.push({
          kind: event.kind,
          channel,
          stream,
          sequence:
            event.kind === "response_usage" ? event.requestSequence : null,
        });
    },
    coverage(code) {
      coverage.push(code);
    },
  });
  let client: import("node:http2").ClientHttp2Session | undefined;
  t.after(async () => {
    client?.destroy();
    await relay.close();
    observer.dispose();
    for (const peer of peers) peer.destroy();
    await new Promise<void>((resolve) => origin.close(() => resolve()));
    fixture.privateKey.fill(0);
    assert.deepEqual(coverage, []);
  });
  const encrypted = connect({
    socket: await tunnel(relay),
    servername: "chatgpt.com",
    ca: await readFile(relay.publicCertificatePath),
    ALPNProtocols: ["h2"],
  });
  client = connectHttp2("https://chatgpt.com", {
    createConnection: () => encrypted,
  });
  const calls = [1, 2].map(
    (n) =>
      new Promise<void>((resolveDone, reject) => {
        const stream = client!.request({
          ":method": "POST",
          ":authority": "chatgpt.com",
          ":path": "/backend-api/codex/responses",
          "content-type": "application/json",
          "session-id": "fixture-session",
        });
        stream.on("error", reject);
        stream.on("data", () => {});
        stream.once("end", resolveDone);
        stream.end(
          JSON.stringify({
            model: "fixture",
            tools: [],
            input: [{ role: "user", content: `fixture-${n}` }],
            prompt_cache_key: "fixture-session",
          }),
        );
      }),
  );
  await Promise.all(calls);
  await relay.flush();
  assert.deepEqual(coverage, []);
  const requests = events.filter((event) => event.kind === "request");
  const replies = events.filter((event) => event.kind === "response_usage");
  assert.equal(requests.length, 2);
  assert.equal(replies.length, 2);
  assert.notEqual(requests[0].channel, requests[1].channel);
  for (const reply of replies)
    assert.ok(
      requests.some(
        (request) =>
          request.stream === reply.stream &&
          request.channel === reply.channel &&
          request.sequence === reply.sequence,
      ),
    );
});

/** Только localhost: origin не обращается к provider, а все application buffers живут в RAM. */
async function upstreamFixture(
  t: TestContext,
  mode:
    "reset_once" | "reset_always" | "certificate" | "pending" | "quiet_close",
) {
  const certificate = await createEphemeralCertificate();
  let wrongTrust:
    Awaited<ReturnType<typeof createEphemeralCertificate>> | undefined;
  let relay: DiagnosticRelay | undefined;
  const peers = new Set<Socket>();
  let dials = 0,
    connections = 0,
    requests = 0,
    responses = 0;
  const observed: Buffer[] = [];
  const attempts: RelayUpstreamAttempt[] = [];
  const coverage: {
    code: RelayCoverageCode;
    connection: number;
    failure?: RelayUpstreamFailure;
  }[] = [];
  let accepted!: () => void, peerClosed!: () => void;
  const firstAccepted = new Promise<void>((resolve) => {
    accepted = resolve;
  });
  const firstPeerClosed = new Promise<void>((resolve) => {
    peerClosed = resolve;
  });
  const body = JSON.stringify({ model: "fixture", input: [] });
  const application = Buffer.from(
    "POST /backend-api/codex/responses HTTP/1.1\r\nHost: chatgpt.com\r\nContent-Type: application/json\r\nContent-Length: " +
      Buffer.byteLength(body) +
      "\r\n\r\n" +
      body,
  );
  const response = Buffer.from(
    'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {"type":"response.completed","response":{"id":"fixture","usage":{"input_tokens":1,"input_tokens_details":{"cached_tokens":0},"output_tokens":0}}}\n\n',
  );
  const tlsOrigin = createServer(
    {
      key: certificate.privateKey,
      cert: certificate.certificate,
      ALPNProtocols: ["http/1.1"],
    },
    (socket) => {
      peers.add(socket);
      socket.on("error", () => {});
      socket.once("close", () => peers.delete(socket));
      if (mode === "quiet_close") {
        socket.end();
        return;
      }
      let received = 0,
        sent = false;
      socket.on("data", (chunk: Buffer) => {
        observed.push(Buffer.from(chunk));
        received += chunk.length;
        if (!sent && received >= application.length) {
          sent = true;
          socket.end(response);
        }
      });
    },
  );
  tlsOrigin.on("tlsClientError", () => {});
  const origin = createTcpServer((socket) => {
    peers.add(socket);
    socket.on("error", () => {});
    const number = ++connections;
    if (number === 1) accepted();
    socket.once("close", () => {
      peers.delete(socket);
      if (number === 1) peerClosed();
    });
    if (mode === "reset_always" || (mode === "reset_once" && number === 1)) {
      // Reset после ClientHello, до любых application bytes: exact ECONNRESET у upstream.
      socket.once("data", () => socket.resetAndDestroy());
    } else if (mode === "pending") {
      // Origin читает TLS bytes без ответа: его FIN/close остаются наблюдаемыми при abort.
      socket.resume();
    } else tlsOrigin.emit("connection", socket);
  });
  t.after(async () => {
    if (relay) await relay.close();
    for (const peer of peers) peer.destroy();
    if (origin.listening)
      await new Promise<void>((resolve) => origin.close(() => resolve()));
    certificate.privateKey.fill(0);
    wrongTrust?.privateKey.fill(0);
  });
  if (mode === "certificate") wrongTrust = await createEphemeralCertificate();
  await new Promise<void>((resolve) => origin.listen(0, "127.0.0.1", resolve));
  const address = origin.address();
  assert.ok(address && typeof address !== "string");
  relay = await startDiagnosticRelay({
    connectUpstream(host, protocols) {
      dials++;
      return connect({
        host: "127.0.0.1",
        port: address.port,
        servername: host,
        rejectUnauthorized: true,
        ca: wrongTrust?.trustCertificate ?? certificate.trustCertificate,
        ALPNProtocols: [...protocols],
      });
    },
    request() {
      requests++;
    },
    responseEvent() {
      responses++;
    },
    coverage(code, connection, _eof, failure) {
      coverage.push({
        code,
        connection,
        ...(failure ? { failure: { ...failure } } : {}),
      });
    },
    upstreamAttempt(event) {
      attempts.push({ ...event });
    },
  });
  const currentRelay = relay;
  const client = async () => {
    const socket = connect({
      socket: await tunnel(currentRelay),
      servername: "chatgpt.com",
      ca: await readFile(currentRelay.publicCertificatePath),
      ALPNProtocols: ["http/1.1"],
    });
    socket.on("error", () => {});
    socket.setTimeout(5000, () => socket.destroy());
    t.after(() => socket.destroy());
    return socket;
  };
  return {
    relay: currentRelay,
    client,
    attempts,
    coverage,
    firstAccepted,
    firstPeerClosed,
    application,
    response,
    observed,
    state: () => ({
      dials,
      connections,
      requests,
      responses,
      peers: peers.size,
    }),
  };
}

/** Завершение localhost fixture ограничено сроком; неизвестные transport errors не сериализуются. */
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("local_tls_fixture_timeout")),
          5000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function rejectedHandshake(socket: TLSSocket): Promise<void> {
  await bounded(
    new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", () =>
        reject(new Error("unexpected_tls_success")),
      );
      socket.once("error", () => resolve());
      socket.once("close", () => resolve());
    }),
  );
}

function assertUpstreamCounters(
  relay: DiagnosticRelay,
  dials: number,
  retries: number,
  recoveries: number,
): void {
  const snapshot = relay.snapshot();
  assert.equal(snapshot.upstreamDials, dials);
  assert.equal(snapshot.upstreamRetryDials, retries);
  assert.equal(snapshot.upstreamRecoveries, recoveries);
}

test("upstream reset один раз восстанавливается ровно одним TLS retry и единственным application request", async (t) => {
  const fixture = await upstreamFixture(t, "reset_once");
  const client = await fixture.client(),
    received: Buffer[] = [];
  await bounded(
    new Promise<void>((resolve, reject) => {
      client.once("error", () => reject(new Error("local_tls_fixture_failed")));
      client.on("data", (chunk: Buffer) => received.push(Buffer.from(chunk)));
      client.once("end", resolve);
      client.once("secureConnect", () => client.write(fixture.application));
    }),
  );
  await fixture.relay.close();
  assert.equal(fixture.state().dials, 2);
  assertUpstreamCounters(fixture.relay, 2, 1, 1);
  assert.equal(fixture.state().requests, 1);
  assert.equal(fixture.state().responses, 1);
  assert.ok(
    Buffer.concat(fixture.observed).equals(fixture.application),
    "application bytes changed or duplicated",
  );
  assert.ok(
    Buffer.concat(received).equals(fixture.response),
    "response bytes changed",
  );
  assert.deepEqual(
    fixture.attempts.map((e) => [e.attempt, e.outcome, e.errorClass]),
    [
      [1, "retrying", "reset"],
      [2, "connected", null],
    ],
  );
  assert.ok(fixture.attempts.every((e) => e.applicationForwarded === false));
  assert.deepEqual(fixture.coverage, []);
});

test("upstream certificate failure не повторяется и остаётся coverage error до application bytes", async (t) => {
  const fixture = await upstreamFixture(t, "certificate");
  await rejectedHandshake(await fixture.client());
  await fixture.relay.close();
  assert.equal(fixture.state().dials, 1);
  assertUpstreamCounters(fixture.relay, 1, 0, 0);
  assert.equal(fixture.state().requests, 0);
  assert.equal(fixture.observed.length, 0);
  assert.deepEqual(
    fixture.attempts.map((e) => [e.attempt, e.outcome, e.errorClass]),
    [[1, "failed", "certificate"]],
  );
  assert.equal(fixture.coverage.length, 1);
  assert.equal(fixture.coverage[0].code, "upstream_tls_failed");
  assert.equal(fixture.coverage[0].failure?.errorClass, "certificate");
  assert.equal(fixture.coverage[0].failure?.applicationForwarded, false);
});

test("два upstream reset исчерпывают retry budget и не объявляют coverage полной", async (t) => {
  const fixture = await upstreamFixture(t, "reset_always");
  await rejectedHandshake(await fixture.client());
  await fixture.relay.close();
  assert.equal(fixture.state().dials, 2);
  assertUpstreamCounters(fixture.relay, 2, 1, 0);
  assert.equal(fixture.state().requests, 0);
  assert.equal(fixture.observed.length, 0);
  assert.deepEqual(
    fixture.attempts.map((e) => [e.attempt, e.outcome, e.errorClass]),
    [
      [1, "retrying", "reset"],
      [2, "failed", "reset"],
    ],
  );
  assert.equal(fixture.coverage.length, 1);
  assert.equal(fixture.coverage[0].code, "upstream_tls_failed");
  assert.equal(fixture.coverage[0].failure?.attempt, 2);
  assert.equal(fixture.coverage[0].failure?.applicationForwarded, false);
});

test("client abort во время upstream handshake отменяет dial и очищает sockets без retry", async (t) => {
  const fixture = await upstreamFixture(t, "pending");
  const client = await fixture.client();
  await bounded(fixture.firstAccepted);
  const closed = new Promise<void>((resolve) =>
    client.once("close", () => resolve()),
  );
  client.destroy();
  await bounded(Promise.all([closed, fixture.firstPeerClosed]));
  await fixture.relay.close();
  assert.equal(fixture.state().dials, 1);
  assertUpstreamCounters(fixture.relay, 1, 0, 0);
  assert.equal(fixture.state().peers, 0);
  assert.equal(fixture.state().requests, 0);
  assert.deepEqual(
    fixture.attempts.map((e) => e.outcome),
    ["cancelled"],
  );
  assert.deepEqual(fixture.coverage, []);
});

test("relay close отменяет pending TLS handshake и очищает owned sockets без retry", async (t) => {
  const fixture = await upstreamFixture(t, "pending");
  const client = await fixture.client();
  await bounded(fixture.firstAccepted);
  const closed = new Promise<void>((resolve) =>
    client.once("close", () => resolve()),
  );
  await fixture.relay.close();
  await bounded(Promise.all([closed, fixture.firstPeerClosed]));
  assert.equal(fixture.state().dials, 1);
  assertUpstreamCounters(fixture.relay, 1, 0, 0);
  assert.equal(fixture.state().peers, 0);
  assert.equal(fixture.state().requests, 0);
  assert.deepEqual(
    fixture.attempts.map((e) => e.outcome),
    ["cancelled"],
  );
  assert.deepEqual(fixture.coverage, []);
  await assert.rejects(access(fixture.relay.publicCertificatePath));
});

test("upstream quiet close после verified TLS до downstream secure немедленно закрывает tunnel без retry", async (t) => {
  const fixture = await upstreamFixture(t, "quiet_close");
  const raw = await tunnel(fixture.relay);
  raw.on("error", () => {});
  const closed = new Promise<void>((resolve) =>
    raw.once("close", () => resolve()),
  );
  // ClientHello идёт в tunnel; server TLS records читаются, но не подаются в TLS client.
  // Поэтому downstream secure callback relay не наступит раньше quiet upstream close.
  const transport = new Duplex({
    read() {},
    write(chunk, encoding, callback) {
      raw.write(chunk, encoding, callback);
    },
    destroy(error, callback) {
      raw.destroy();
      callback(error);
    },
  });
  raw.on("data", () => {});
  raw.once("end", () => transport.push(null));
  raw.once("close", () => transport.destroy());
  const client = connect({
    socket: transport,
    servername: "chatgpt.com",
    ca: await readFile(fixture.relay.publicCertificatePath),
    ALPNProtocols: ["http/1.1"],
  });
  client.on("error", () => {});
  t.after(() => {
    client.destroy();
    transport.destroy();
    raw.destroy();
  });
  await bounded(closed);
  await fixture.relay.close();
  assert.equal(fixture.state().dials, 1);
  assert.equal(fixture.state().requests, 0);
  assert.equal(fixture.observed.length, 0);
  assert.equal(fixture.relay.snapshot().tlsEstablished, 0);
  assertUpstreamCounters(fixture.relay, 1, 0, 0);
  assert.deepEqual(
    fixture.attempts.map((e) => [e.attempt, e.outcome]),
    [[1, "connected"]],
  );
  assert.equal(fixture.coverage.length, 1);
  assert.equal(fixture.coverage[0].code, "upstream_tls_failed");
  assert.deepEqual(fixture.coverage[0].failure, {
    attempt: 1,
    stage: "downstream_tls",
    errorClass: "peer_closed",
    applicationForwarded: false,
  });
});
