/**
 * @file .ai/tools/codex-request-diagnostics/src/diagnosticRelay.adapter.ts
 * @version 1.0.1
 * @date 2026-11-24
 * @description Наблюдает копию HTTP/WS потока через временный authenticated CONNECT relay без записи payload.
 */
import { createServer as createHttpServer } from "node:http";
import {
  createServer as createTlsServer,
  connect as connectTls,
} from "node:tls";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket } from "node:net";
import { Duplex } from "node:stream";
import type { TLSSocket } from "node:tls";
import { format as formatUrl } from "node:url";
import { createEphemeralCertificate } from "./createEphemeralCertificate.adapter.ts";
import { readClientHello } from "./clientHello.util.ts";
import { ApplicationStreamTap } from "./applicationStream.adapter.ts";
import {
  classifyUpstreamTlsError,
  connectVerifiedUpstream,
} from "./connectVerifiedUpstream.service.ts";
import type {
  DiagnosticRelay,
  DiagnosticRelayOptions,
  RelayCoverageCode,
  RelayUpstreamFailure,
} from "./diagnosticRelay.types.ts";
import type { Http2EofDiagnostics } from "./http2Stream.types.ts";

const HOSTS = new Set(["chatgpt.com", "api.openai.com"]);
// Одновременные owned sockets и число CONNECT за весь запуск имеют разные бюджеты.
const MAX_ACTIVE_SOCKETS = 64;
const MAX_TOTAL_CONNECTIONS = 128;
const MAX_BUFFERED_HANDSHAKE_BYTES = 65536;

/**
 * Оставляет provider URL/Host/cookies прежними; исходные application bytes копируются с backpressure.
 * TLS sessions и timing меняются: обе ветки измерения обязаны пользоваться одним relay.
 * На диске находится только публичный сертификат. Private key и proxy credential живут в RAM.
 */
export async function startDiagnosticRelay(
  options: DiagnosticRelayOptions,
): Promise<DiagnosticRelay> {
  const certificate = await createEphemeralCertificate();
  let directory: string;
  try {
    directory = await mkdtemp(join(tmpdir(), "codex-hash-diagnostics-"));
  } catch {
    certificate.privateKey.fill(0);
    throw new Error("relay_start_failed");
  }
  const certificatePath = join(directory, "public-ca.pem");
  let credentialBytes: Buffer;
  try {
    credentialBytes = randomBytes(32);
  } catch {
    certificate.privateKey.fill(0);
    await rm(directory, { recursive: true, force: true });
    throw new Error("relay_start_failed");
  }
  const proxyAuth = `diagnostic:${credentialBytes.toString("hex")}`;
  const expectedAuthorization = Buffer.from(
    `Basic ${Buffer.from(proxyAuth).toString("base64")}`,
  );
  const sockets = new Set<Duplex>();
  const taps = new Set<ApplicationStreamTap>();
  const handshakeClosers = new Set<() => void>();
  let connections = 0;
  let tlsEstablished = 0,
    clientApplicationBytes = 0,
    serverApplicationBytes = 0;
  let upstreamDials = 0,
    upstreamRetryDials = 0,
    upstreamRecoveries = 0;
  let nextChannel = 1000;
  let closed = false;
  let closing: Promise<void> | undefined;
  const coverage = (
    code: RelayCoverageCode,
    connection: number,
    http2Eof?: Http2EofDiagnostics,
    upstreamFailure?: RelayUpstreamFailure,
  ) => {
    try {
      options.coverage(code, connection, http2Eof, upstreamFailure);
    } catch {
      /* Не выдаём исключения обработчика с пользовательскими данными. */
    }
  };
  const own = <T extends Duplex>(socket: T): T => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    return socket;
  };
  const server = createHttpServer(
    { maxHeaderSize: 16384, headersTimeout: 10000, requestTimeout: 10000 },
    (_req, response) => {
      response.writeHead(405);
      response.end();
    },
  );
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("error", () => coverage("observer_failed", 0));
  server.on("connection", (socket) => {
    if (sockets.size >= MAX_ACTIVE_SOCKETS) {
      socket.destroy();
      coverage("connection_budget_exceeded", 0);
      return;
    }
    own(socket).setTimeout(10000, () => socket.destroy());
  });
  server.on("connect", (request, raw, head) => {
    const connection = ++connections;
    const authorization = Buffer.from(
      request.headers["proxy-authorization"] ?? "",
    );
    if (
      authorization.length !== expectedAuthorization.length ||
      !timingSafeEqual(authorization, expectedAuthorization)
    ) {
      raw.end(
        "HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=diagnostic\r\nContent-Length: 0\r\n\r\n",
      );
      return;
    }
    const authority = /^([a-z0-9.-]+):443$/i.exec(request.url ?? "");
    const host = authority?.[1].toLowerCase();
    if (!host || !HOSTS.has(host) || closed) {
      if (options.policyRejection) {
        try {
          options.policyRejection(connection);
        } catch {
          coverage("observer_failed", connection);
        }
      } else coverage("destination_rejected", connection);
      raw.destroy();
      return;
    }
    if (connection > MAX_TOTAL_CONNECTIONS) {
      coverage("connection_budget_exceeded", connection);
      raw.destroy();
      return;
    }
    (raw as Socket).setTimeout(240000, () => raw.destroy());
    raw.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    let hello = Buffer.from(head);
    let dialing = false;
    const failed = () => raw.destroy();
    raw.on("error", failed);
    const consume = (chunk: Buffer) => {
      if (dialing) return;
      hello = Buffer.concat([hello, chunk]);
      const parsed = readClientHello(hello);
      if (parsed.state === "pending") return;
      if (
        parsed.state === "invalid" ||
        parsed.servername.toLowerCase() !== host
      ) {
        coverage("client_hello_invalid", connection);
        raw.destroy();
        return;
      }
      dialing = true;
      raw.pause();
      raw.removeListener("data", consume);
      const abort = new AbortController();
      let upstreamSocket: TLSSocket | undefined;
      let downstream: TLSSocket | undefined;
      let ready = false,
        connectionClosed = false;
      const closeBoth = () => {
        if (connectionClosed) return;
        connectionClosed = true;
        handshakeClosers.delete(closeBoth);
        abort.abort();
        upstreamSocket?.destroy();
        downstream?.destroy();
        hello = Buffer.alloc(0);
        raw.destroy();
      };
      handshakeClosers.add(closeBoth);
      raw.once("close", closeBoth);
      raw.once("error", closeBoth);
      // Чтение остаётся активным до handoff, иначе pause скрывает FIN и отмена ждёт deadline.
      // Сохраняем encrypted prefix целиком, под тем же 64 KiB пределом, без forwarding.
      const hold = (chunk: Buffer) => {
        if (hello.length + chunk.length > MAX_BUFFERED_HANDSHAKE_BYTES) {
          coverage("client_hello_invalid", connection);
          closeBoth();
        } else hello = Buffer.concat([hello, chunk]);
      };
      raw.on("data", hold);
      raw.once("end", closeBoth);
      raw.resume();
      connectVerifiedUpstream({
        connection,
        signal: abort.signal,
        dial: (attempt) => {
          upstreamDials++;
          if (attempt === 2) upstreamRetryDials++;
          return own(
            options.connectUpstream
              ? options.connectUpstream(host, parsed.protocols)
              : connectTls({
                  host,
                  port: 443,
                  servername: host,
                  rejectUnauthorized: true,
                  ALPNProtocols: parsed.protocols,
                }),
          );
        },
        attempt(event) {
          try {
            options.upstreamAttempt?.(event);
          } catch {
            coverage("observer_failed", connection);
          }
        },
        failed(details) {
          coverage(
            details.errorClass === "observer"
              ? "observer_failed"
              : "upstream_tls_failed",
            connection,
            undefined,
            details,
          );
          closeBoth();
        },
        verified(upstream, upstreamAttempt) {
          upstreamSocket = upstream;
          handshakeClosers.delete(closeBoth);
          if (upstreamAttempt === 2) upstreamRecoveries++;
          if (connectionClosed || closed || raw.destroyed) {
            closeBoth();
            upstream.destroy();
            return;
          }
          raw.pause();
          raw.removeListener("data", hold);
          raw.removeListener("end", closeBoth);
          upstream.setTimeout(240000, closeBoth);
          const lostBeforeForwarding = (
            errorClass: RelayUpstreamFailure["errorClass"],
          ) => {
            if (!ready && !connectionClosed)
              coverage("upstream_tls_failed", connection, undefined, {
                attempt: upstreamAttempt,
                stage: "downstream_tls",
                errorClass,
                applicationForwarded: false,
              });
            closeBoth();
          };
          // Guard подключён сразу после upstream TLS, включая окно до downstream secure callback.
          upstream.on("error", (error) =>
            lostBeforeForwarding(classifyUpstreamTlsError(error)),
          );
          upstream.once("end", () => {
            if (!ready) lostBeforeForwarding("peer_closed");
          });
          upstream.once("close", () => lostBeforeForwarding("peer_closed"));
          const protocol = upstream.alpnProtocol;
          if (protocol && !parsed.protocols.includes(protocol)) {
            coverage("alpn_mismatch", connection);
            closeBoth();
            return;
          }
          const tlsServer = createTlsServer(
            {
              key: certificate.privateKey,
              cert: certificate.certificate,
              ALPNProtocols: protocol ? [protocol] : [],
            },
            (socket) => {
              downstream = own(socket);
              if (connectionClosed || closed || raw.destroyed) {
                socket.destroy();
                return;
              }
              if (socket.alpnProtocol !== protocol) {
                coverage("alpn_mismatch", connection);
                closeBoth();
                return;
              }
              ready = true;
              tlsEstablished++;
              const channels = new Map<number, number>();
              const channel = (
                headers: Readonly<Record<string, string>> | undefined,
              ) => {
                if (protocol !== "h2")
                  return { connection, streamIndex: undefined };
                const streamIndex = Number(headers?.[":diagnostic-stream-id"]);
                if (
                  !Number.isSafeInteger(streamIndex) ||
                  streamIndex < 1 ||
                  (channels.size >= 128 && !channels.has(streamIndex))
                ) {
                  coverage("observer_failed", connection);
                  return null;
                }
                if (!channels.has(streamIndex))
                  channels.set(streamIndex, nextChannel++);
                return { connection: channels.get(streamIndex)!, streamIndex };
              };
              const tap = new ApplicationStreamTap({
                request(body, headers) {
                  const selected = channel(headers);
                  if (!selected) return;
                  options.request(body, {
                    transport:
                      headers.upgrade?.toLowerCase() === "websocket"
                        ? "websocket"
                        : protocol === "h2"
                          ? "http2"
                          : "http1",
                    connection: selected.connection,
                    physicalConnection: connection,
                    streamIndex: selected.streamIndex,
                    headers,
                  });
                },
                responseEvent(value, headers) {
                  const selected = channel(headers);
                  if (selected)
                    options.responseEvent(
                      value,
                      selected.connection,
                      connection,
                      selected.streamIndex,
                    );
                },
                coverage(code, http2Eof) {
                  coverage(code, connection, http2Eof);
                },
              });
              taps.add(tap);
              const safeTap = (side: "client" | "server", chunk: Buffer) => {
                if (side === "client") clientApplicationBytes += chunk.length;
                else serverApplicationBytes += chunk.length;
                try {
                  if (side === "client") tap.clientData(Buffer.from(chunk));
                  else tap.serverData(Buffer.from(chunk));
                } catch {
                  coverage("observer_failed", connection);
                }
              };
              socket.on("data", (chunk: Buffer) => safeTap("client", chunk));
              upstream.on("data", (chunk: Buffer) => safeTap("server", chunk));
              socket.once("end", () => {
                try {
                  tap.endClient();
                } catch {
                  coverage("observer_failed", connection);
                }
              });
              upstream.once("end", () => {
                try {
                  tap.endServer();
                } catch {
                  coverage("observer_failed", connection);
                }
              });
              socket.on("error", closeBoth);
              socket.once("close", () => upstream.destroy());
              socket.pipe(upstream);
              upstream.pipe(socket);
            },
          );
          tlsServer.on("tlsClientError", () => {
            if (!connectionClosed)
              coverage("downstream_tls_failed", connection);
            closeBoth();
          });
          tlsServer.on("error", () => {
            if (!connectionClosed)
              coverage("downstream_tls_failed", connection);
            closeBoth();
          });
          // TLSSocket перехватывает native handle Socket и не читает его unshift buffer.
          // JS Duplex сохраняет прочитанный ClientHello и исходный encrypted stream без потерь.
          const buffered = own(
            new Duplex({
              read() {
                raw.resume();
              },
              write(chunk, encoding, callback) {
                raw.write(chunk, encoding, callback);
              },
              final(callback) {
                raw.end(callback);
              },
              destroy(error, callback) {
                raw.destroy();
                callback(error);
              },
            }),
          );
          buffered.on("error", closeBoth);
          raw.on("data", (chunk: Buffer) => {
            if (!buffered.push(chunk)) raw.pause();
          });
          raw.once("end", () => buffered.push(null));
          raw.once("close", () => buffered.destroy());
          buffered.push(hello);
          hello = Buffer.alloc(0);
          tlsServer.emit("connection", buffered);
          raw.resume();
        },
      });
    };
    raw.on("data", consume);
    if (head.length) {
      hello = Buffer.alloc(0);
      consume(head);
    }
    raw.resume();
  });
  try {
    await writeFile(certificatePath, certificate.trustCertificate, {
      mode: 0o600,
      flag: "wx",
    });
    await new Promise<void>((resolve, reject) => {
      const failure = () => reject(new Error("relay_start_failed"));
      server.once("error", failure);
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", failure);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("relay_start_failed");
    const proxyUrl = formatUrl({
      protocol: "http:",
      hostname: address.address,
      port: address.port,
      auth: proxyAuth,
    });
    const environment = Object.freeze({
      HTTPS_PROXY: proxyUrl,
      HTTP_PROXY: proxyUrl,
      ALL_PROXY: "",
      NO_PROXY: "localhost,127.0.0.1,::1,auth.openai.com",
      CODEX_CA_CERTIFICATE: certificatePath,
    });
    const result = {
      publicCertificatePath: certificatePath,
      snapshot() {
        return {
          connections,
          tlsEstablished,
          clientApplicationBytes,
          serverApplicationBytes,
          upstreamDials,
          upstreamRetryDials,
          upstreamRecoveries,
        };
      },
      async flush() {
        await Promise.all([...taps].map((tap) => tap.flush()));
      },
      close() {
        if (closing) return closing;
        closed = true;
        // Отмена должна опередить destroy upstream: иначе clean close выглядит retryable EOF.
        for (const closeHandshake of [...handshakeClosers]) closeHandshake();
        handshakeClosers.clear();
        closing = (async () => {
          try {
            await Promise.all([...taps].map((tap) => tap.flush()));
          } catch {
            coverage("observer_failed", 0);
          }
          for (const socket of sockets) socket.destroy();
          // Destroy завершает capture без обязательного native `end`; parser всё равно
          // проверяет незаконченные frames/model streams и не объявляет их полными.
          for (const tap of taps) {
            try {
              tap.endClient();
              tap.endServer();
            } catch {
              coverage("observer_failed", 0);
            }
          }
          try {
            await new Promise<void>((resolve) => server.close(() => resolve()));
            try {
              await Promise.all([...taps].map((tap) => tap.finish()));
            } catch {
              coverage("observer_failed", 0);
            }
            taps.clear();
          } finally {
            certificate.privateKey.fill(0);
            credentialBytes.fill(0);
            expectedAuthorization.fill(0);
            await rm(directory, { recursive: true, force: true });
          }
        })();
        return closing;
      },
    } as DiagnosticRelay;
    // JSON.stringify/обычный inspect relay не должны случайно раскрыть proxy credential.
    Object.defineProperty(result, "childEnvironment", {
      enumerable: false,
      get: () => environment,
    });
    return result;
  } catch {
    for (const closeHandshake of [...handshakeClosers]) closeHandshake();
    handshakeClosers.clear();
    for (const socket of sockets) socket.destroy();
    server.close();
    certificate.privateKey.fill(0);
    credentialBytes.fill(0);
    expectedAuthorization.fill(0);
    await rm(directory, { recursive: true, force: true });
    throw new Error("relay_start_failed");
  }
}
