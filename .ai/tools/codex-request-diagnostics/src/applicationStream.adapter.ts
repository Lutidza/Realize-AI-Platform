/**
 * @file .ai/tools/codex-request-diagnostics/src/applicationStream.adapter.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Наблюдает HTTP/WS потоки в памяти без изменения передаваемых байтов.
 */
import {
  brotliDecompressSync,
  constants,
  gunzipSync,
  inflateRawSync,
  inflateSync,
  zstdDecompressSync,
} from "node:zlib";
import { Http2StreamTap } from "./http2Stream.adapter.ts";
import type { Http2EofDiagnostics } from "./http2Stream.types.ts";
import type {
  ApplicationDirection,
  ApplicationHttpContext,
  ApplicationHttpMessage,
  ApplicationHttpState,
  ApplicationRequestHeaders,
  ApplicationStreamCallbacks,
  ApplicationStreamCoverageCode,
  ApplicationStreamLimits,
  ApplicationWsCompression,
  ApplicationWsState,
} from "./applicationStream.types.ts";

const defaults: ApplicationStreamLimits = {
  maxHeadersBytes: 64 * 1024,
  maxHeaderCount: 256,
  maxPendingRequests: 128,
  maxBodyBytes: 16 * 1024 * 1024,
  maxFrameBytes: 8 * 1024 * 1024,
  maxMessageBytes: 8 * 1024 * 1024,
  maxEventBytes: 1024 * 1024,
  maxFrames: 100_000,
  maxMessages: 100_000,
};
const h2Preface = Buffer.from("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n");
const deflateTail = Buffer.from([0, 0, 255, 255]);
const httpState = (): ApplicationHttpState => ({
  buffer: Buffer.alloc(0),
  message: null,
  awaitingUpgrade: false,
});
const wsState = (): ApplicationWsState => ({
  buffer: Buffer.alloc(0),
  fragments: null,
  fragmentBytes: 0,
  compressed: false,
  dictionary: Buffer.alloc(0),
  frames: 0,
  closed: false,
});

class ParseFailure extends Error {
  constructor(
    readonly code: ApplicationStreamCoverageCode,
    readonly http2Eof?: Http2EofDiagnostics,
  ) {
    super(code);
  }
}
function fail(
  code: ApplicationStreamCoverageCode,
  http2Eof?: Http2EofDiagnostics,
): never {
  throw new ParseFailure(code, http2Eof);
}
const outputLimit = (error: unknown) =>
  error instanceof Error &&
  "code" in error &&
  error.code === "ERR_BUFFER_TOO_LARGE";
const tokens = (value = "") =>
  value
    .toLowerCase()
    .split(",")
    .map((item) => item.trim());
const modelPath = (path: string) => path.split("?")[0].endsWith("/responses");

/** Пассивный tap: любой отказ отключает только наблюдение, не бросая исключение в relay. */
export class ApplicationStreamTap {
  private readonly limits: ApplicationStreamLimits;
  private readonly http = { client: httpState(), server: httpState() };
  private readonly ws = { client: wsState(), server: wsState() };
  private readonly requests: ApplicationHttpContext[] = [];
  private upgradeContext: ApplicationHttpContext | null = null;
  private compression: ApplicationWsCompression = {
    enabled: false,
    clientNoContextTakeover: false,
    serverNoContextTakeover: false,
    clientWindowBits: 15,
    serverWindowBits: 15,
  };
  private websocket = false;
  private http2: Http2StreamTap | null = null;
  private disabled = false;
  private detectingProtocol = true;
  private messages = 0;

  constructor(
    private readonly callbacks: ApplicationStreamCallbacks,
    limits: Partial<ApplicationStreamLimits> = {},
  ) {
    this.limits = { ...defaults, ...limits };
    if (
      Object.values(this.limits).some(
        (value) => !Number.isSafeInteger(value) || value < 1,
      )
    )
      throw new Error("invalid_application_stream_limit");
  }

  clientData(chunk: Uint8Array): void {
    this.feed("client", chunk);
  }
  serverData(chunk: Uint8Array): void {
    this.feed("server", chunk);
  }
  endClient(): void {
    this.end("client");
  }
  endServer(): void {
    this.end("server");
  }

  /** Даёт H2 decoder обработать уже скопированные frames без закрытия живой phase. */
  flush(): Promise<void> {
    return this.http2?.flush() ?? Promise.resolve();
  }

  /** После EOF освобождает только RAM decoder; HTTP1/WS callbacks синхронны. */
  finish(): Promise<void> {
    return this.http2?.finish() ?? Promise.resolve();
  }

  private guarded(operation: () => void): void {
    if (this.disabled) return;
    try {
      operation();
    } catch (error) {
      this.disabled = true;
      this.http2?.dispose();
      for (const direction of ["client", "server"] as const) {
        this.http[direction].buffer = Buffer.alloc(0);
        this.http[direction].message = null;
        this.ws[direction].buffer = Buffer.alloc(0);
        this.ws[direction].fragments = null;
        this.ws[direction].dictionary = Buffer.alloc(0);
      }
      this.requests.length = 0;
      this.upgradeContext = null;
      const code =
        error instanceof ParseFailure ? error.code : "callback_failed";
      try {
        this.callbacks.coverage(
          code,
          error instanceof ParseFailure && code === "http2_truncated"
            ? error.http2Eof
            : undefined,
        );
      } catch {
        /* Relay продолжает передачу независимо от callback. */
      }
    }
  }

  private feed(direction: ApplicationDirection, chunk: Uint8Array): void {
    this.guarded(() => {
      // Собственные копии не разделяют память с bytes, передаваемыми relay.
      for (let offset = 0; offset < chunk.length; offset += 64 * 1024) {
        const part = Buffer.from(chunk.subarray(offset, offset + 64 * 1024));
        if (this.http2) {
          if (direction === "client") this.http2.clientData(part);
          else this.http2.serverData(part);
        } else if (this.websocket) {
          const state = this.ws[direction];
          state.buffer = Buffer.concat([state.buffer, part]);
          this.parseFrames(direction);
        } else {
          const state = this.http[direction];
          state.buffer = Buffer.concat([state.buffer, part]);
          this.parseHttp(direction);
          if (
            direction === "client" &&
            !this.detectingProtocol &&
            !this.http2 &&
            this.http.server.buffer.length
          )
            this.parseHttp("server");
        }
      }
    });
  }

  private end(direction: ApplicationDirection): void {
    this.guarded(() => {
      if (this.http2) {
        if (direction === "client") this.http2.endClient();
        else this.http2.endServer();
        return;
      }
      if (this.websocket) {
        const state = this.ws[direction];
        if (state.buffer.length || state.fragments) fail("ws_truncated");
        return;
      }
      const state = this.http[direction];
      if (state.message?.mode === "close") this.completeHttp(direction);
      if (
        state.buffer.length ||
        state.message ||
        (direction === "server" && this.requests.length)
      )
        fail("http1_truncated");
    });
  }

  private headerBlock(raw: Buffer): {
    first: string;
    headers: ApplicationRequestHeaders;
  } {
    const lines = raw.toString("latin1").split("\r\n");
    const first = lines.shift()!;
    if (lines.length > this.limits.maxHeaderCount) fail("http1_headers_limit");
    const headers: Record<string, string> = Object.create(null);
    for (const line of lines) {
      const match =
        /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*([^\r\n\x00]*)$/u.exec(line);
      if (!match) fail("http1_invalid_headers");
      const name = match[1].toLowerCase(),
        value = match[2].trim();
      if (name === "content-length" && Object.hasOwn(headers, name))
        fail("http1_invalid_framing");
      headers[name] = Object.hasOwn(headers, name)
        ? `${headers[name]}, ${value}`
        : value;
    }
    return { first, headers: Object.freeze(headers) };
  }

  private parseHttp(direction: ApplicationDirection): void {
    const state = this.http[direction];
    while (!this.websocket) {
      if (direction === "server" && this.detectingProtocol) {
        if (state.buffer.length > this.limits.maxHeadersBytes)
          fail("http1_headers_limit");
        return;
      }
      if (direction === "client" && this.detectingProtocol) {
        const prefix = state.buffer.subarray(
          0,
          Math.min(state.buffer.length, h2Preface.length),
        );
        if (prefix.equals(h2Preface.subarray(0, prefix.length))) {
          if (state.buffer.length < h2Preface.length) return;
          this.startHttp2();
          return;
        }
      }
      if (state.awaitingUpgrade) {
        if (state.buffer.length > this.limits.maxFrameBytes + 14)
          fail("ws_frame_limit");
        return;
      }
      if (state.message) {
        if (!this.consumeBody(direction)) return;
        continue;
      }
      const boundary = state.buffer.indexOf("\r\n\r\n");
      if (boundary === -1) {
        if (state.buffer.length > this.limits.maxHeadersBytes)
          fail("http1_headers_limit");
        return;
      }
      if (boundary + 4 > this.limits.maxHeadersBytes)
        fail("http1_headers_limit");
      const { first, headers } = this.headerBlock(
        state.buffer.subarray(0, boundary),
      );
      state.buffer = state.buffer.subarray(boundary + 4);
      let context: ApplicationHttpContext;
      let status: number | null = null;
      if (direction === "client") {
        this.detectingProtocol = false;
        const match =
          /^([!#$%&'*+.^_`|~0-9A-Za-z-]+) ([^\x00-\x20\x7f]+) HTTP\/1\.[01]$/u.exec(
            first,
          );
        if (!match) fail("http1_invalid_headers");
        const method = match[1],
          path = match[2];
        const upgrade =
          method === "GET" &&
          headers.upgrade?.toLowerCase() === "websocket" &&
          tokens(headers.connection).includes("upgrade");
        context = {
          method,
          path,
          upgrade,
          model: modelPath(path),
          headers: Object.freeze({
            ...headers,
            ":method": method,
            ":path": path,
          }),
        };
        this.requests.push(context);
        if (this.requests.length > this.limits.maxPendingRequests)
          fail("http1_request_count_limit");
      } else {
        const match = /^HTTP\/1\.[01] ([1-5][0-9]{2})(?: [^\r\n]*)?$/u.exec(
          first,
        );
        if (!match || !this.requests.length) fail("http1_invalid_headers");
        status = Number(match[1]);
        context = this.requests[0];
        if (status === 101) {
          this.requests.shift();
          this.startWebSocket(context, headers);
          return;
        }
        if (status >= 200 && context.upgrade) fail("http1_upgrade_invalid");
      }
      const noBody =
        direction === "server" &&
        (context.method === "HEAD" ||
          status === 204 ||
          status === 304 ||
          status! < 200);
      const transfer = headers["transfer-encoding"];
      const length = headers["content-length"];
      if (transfer && length !== undefined) fail("http1_invalid_framing");
      let mode: ApplicationHttpMessage["mode"] = "none",
        remaining = 0;
      if (!noBody && transfer) {
        if (transfer.toLowerCase().trim() !== "chunked")
          fail("http1_invalid_framing");
        mode = "chunked";
      } else if (!noBody && length !== undefined) {
        if (!/^[0-9]+$/u.test(length)) fail("http1_invalid_framing");
        remaining = Number(length);
        if (!Number.isSafeInteger(remaining)) fail("http1_invalid_framing");
        if (remaining > this.limits.maxBodyBytes) fail("http1_body_limit");
        mode = "length";
      } else if (!noBody && direction === "server") mode = "close";
      state.message = {
        context,
        headers,
        status,
        mode,
        remaining,
        chunkPhase: "size",
        chunks: [],
        bytes: 0,
      };
    }
  }

  private appendBody(message: ApplicationHttpMessage, data: Buffer): void {
    message.bytes += data.length;
    if (message.bytes > this.limits.maxBodyBytes) fail("http1_body_limit");
    if (message.context.model) message.chunks.push(Buffer.from(data));
  }

  private consumeBody(direction: ApplicationDirection): boolean {
    const state = this.http[direction],
      message = state.message!;
    if (
      message.mode === "none" ||
      (message.mode === "length" && message.remaining === 0)
    ) {
      this.completeHttp(direction);
      return true;
    }
    if (message.mode === "close") {
      this.appendBody(message, state.buffer);
      state.buffer = Buffer.alloc(0);
      return false;
    }
    if (message.mode === "length" || message.chunkPhase === "data") {
      const count = Math.min(state.buffer.length, message.remaining);
      if (!count) return false;
      this.appendBody(message, state.buffer.subarray(0, count));
      state.buffer = state.buffer.subarray(count);
      message.remaining -= count;
      if (message.mode === "chunked" && !message.remaining)
        message.chunkPhase = "data_end";
      return true;
    }
    if (message.chunkPhase === "data_end") {
      if (state.buffer.length < 2) return false;
      if (state.buffer[0] !== 13 || state.buffer[1] !== 10)
        fail("http1_invalid_framing");
      state.buffer = state.buffer.subarray(2);
      message.chunkPhase = "size";
      return true;
    }
    if (message.chunkPhase === "size") {
      const end = state.buffer.indexOf("\r\n");
      if (end === -1) {
        if (state.buffer.length > this.limits.maxHeadersBytes)
          fail("http1_headers_limit");
        return false;
      }
      const text = state.buffer.subarray(0, end).toString("latin1");
      if (!/^[a-fA-F0-9]+(?:;[^\r\n]*)?$/u.test(text))
        fail("http1_invalid_framing");
      const size = Number.parseInt(text.split(";")[0], 16);
      if (
        !Number.isSafeInteger(size) ||
        message.bytes + size > this.limits.maxBodyBytes
      )
        fail("http1_body_limit");
      state.buffer = state.buffer.subarray(end + 2);
      message.remaining = size;
      message.chunkPhase = size ? "data" : "trailers";
      return true;
    }
    if (
      state.buffer.length >= 2 &&
      state.buffer[0] === 13 &&
      state.buffer[1] === 10
    ) {
      state.buffer = state.buffer.subarray(2);
      this.completeHttp(direction);
      return true;
    }
    const end = state.buffer.indexOf("\r\n\r\n");
    if (end === -1) {
      if (state.buffer.length > this.limits.maxHeadersBytes)
        fail("http1_headers_limit");
      return false;
    }
    if (end + 4 > this.limits.maxHeadersBytes) fail("http1_headers_limit");
    this.headerBlock(
      Buffer.concat([
        Buffer.from("trailers\r\n"),
        state.buffer.subarray(0, end),
      ]),
    );
    state.buffer = state.buffer.subarray(end + 4);
    this.completeHttp(direction);
    return true;
  }

  private decodeContent(
    body: Buffer,
    headers: ApplicationRequestHeaders,
  ): Buffer {
    let decoded = body;
    for (const encoding of tokens(headers["content-encoding"]).reverse()) {
      if (!encoding || encoding === "identity") continue;
      const options = { maxOutputLength: this.limits.maxBodyBytes };
      try {
        switch (encoding) {
          case "gzip":
          case "x-gzip":
            decoded = gunzipSync(decoded, options);
            break;
          case "deflate":
            decoded = inflateSync(decoded, options);
            break;
          case "br":
            decoded = brotliDecompressSync(decoded, options);
            break;
          case "zstd":
            decoded = zstdDecompressSync(decoded, options);
            break;
          default:
            fail("content_encoding_unsupported");
        }
      } catch (error) {
        if (error instanceof ParseFailure) throw error;
        if (outputLimit(error)) fail("http1_body_limit");
        fail("content_encoding_invalid");
      }
      if (decoded.length > this.limits.maxBodyBytes) fail("http1_body_limit");
    }
    return decoded;
  }

  private json(body: Buffer, code: ApplicationStreamCoverageCode): unknown {
    try {
      return JSON.parse(this.utf8(body, code));
    } catch {
      fail(code);
    }
  }

  private utf8(body: Buffer, code: ApplicationStreamCoverageCode): string {
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        body,
      );
    } catch {
      fail(code);
    }
  }

  private countMessage(): void {
    if (++this.messages > this.limits.maxMessages) fail("response_event_limit");
  }

  private completeHttp(direction: ApplicationDirection): void {
    const state = this.http[direction],
      message = state.message!;
    state.message = null;
    if (direction === "client") {
      if (message.context.upgrade) state.awaitingUpgrade = true;
      if (message.context.model && message.context.method === "POST") {
        this.captureRequest(
          Buffer.concat(message.chunks),
          message.context.headers,
        );
      }
      return;
    }
    if (message.status! < 200) return;
    this.requests.shift();
    if (!message.context.model || message.context.method !== "POST") return;
    this.captureResponse(Buffer.concat(message.chunks), message.headers);
  }

  private captureRequest(
    raw: Buffer,
    headers: ApplicationRequestHeaders,
  ): void {
    const body = this.decodeContent(raw, headers);
    this.json(body, "request_json_invalid");
    this.countMessage();
    this.callbacks.request(body, headers);
  }

  private captureResponse(
    raw: Buffer,
    headers: ApplicationRequestHeaders,
    requestHeaders?: ApplicationRequestHeaders,
  ): void {
    const body = this.decodeContent(raw, headers);
    const type = headers["content-type"]?.toLowerCase() ?? "";
    if (type.startsWith("text/event-stream")) {
      let data: string[] = [];
      let eventBytes = 0;
      const text = this.utf8(body, "response_json_invalid");
      for (const line of [
        ...text.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n").split("\n"),
        "",
      ]) {
        if (!line) {
          if (data.length) {
            const value = data.join("\n");
            if (value && value !== "[DONE]") {
              this.countMessage();
              this.callbacks.responseEvent(
                this.json(Buffer.from(value), "response_json_invalid"),
                requestHeaders,
              );
            }
          }
          data = [];
          eventBytes = 0;
        } else if (line.startsWith("data:")) {
          const value = line.slice(5).replace(/^ /u, "");
          eventBytes += Buffer.byteLength(value) + 1;
          if (eventBytes > this.limits.maxEventBytes)
            fail("response_event_limit");
          data.push(value);
        }
      }
    } else if (type.startsWith("application/json")) {
      if (body.length > this.limits.maxEventBytes) fail("response_event_limit");
      this.countMessage();
      this.callbacks.responseEvent(
        this.json(body, "response_json_invalid"),
        requestHeaders,
      );
    } else fail("response_content_type_unsupported");
  }

  private startHttp2(): void {
    this.detectingProtocol = false;
    this.http2 = new Http2StreamTap(
      {
        request: (body, headers) =>
          this.guarded(() => this.captureRequest(body, headers)),
        response: (body, headers, requestHeaders) =>
          this.guarded(() =>
            this.captureResponse(body, headers, requestHeaders),
          ),
        coverage: (code, http2Eof) => this.guarded(() => fail(code, http2Eof)),
      },
      {
        maxFrameBytes: this.limits.maxFrameBytes,
        maxFrames: this.limits.maxFrames,
        maxStreams: this.limits.maxPendingRequests,
        maxHeadersBytes: this.limits.maxHeadersBytes,
        maxBodyBytes: this.limits.maxBodyBytes,
      },
    );
    for (const direction of ["client", "server"] as const) {
      const pending = this.http[direction].buffer;
      this.http[direction].buffer = Buffer.alloc(0);
      if (pending.length) {
        if (direction === "client") this.http2.clientData(pending);
        else this.http2.serverData(pending);
      }
    }
  }

  private startWebSocket(
    context: ApplicationHttpContext,
    headers: ApplicationRequestHeaders,
  ): void {
    if (
      !context.upgrade ||
      headers.upgrade?.toLowerCase() !== "websocket" ||
      !tokens(headers.connection).includes("upgrade")
    )
      fail("http1_upgrade_invalid");
    const extension = headers["sec-websocket-extensions"];
    if (extension) {
      if (
        !tokens(context.headers["sec-websocket-extensions"]).some(
          (item) => item.split(";")[0].trim() === "permessage-deflate",
        )
      )
        fail("ws_compression_unsupported");
      const parts = extension
        .toLowerCase()
        .split(";")
        .map((part) => part.trim());
      if (parts.shift() !== "permessage-deflate")
        fail("ws_compression_unsupported");
      const seen = new Set<string>();
      this.compression.enabled = true;
      for (const part of parts) {
        const pair = /^([a-z_]+)(?:=(?:"([0-9]+)"|([0-9]+)))?$/u.exec(part);
        if (!pair || seen.has(pair[1])) fail("ws_compression_unsupported");
        const key = pair[1],
          value = pair[2] ?? pair[3];
        seen.add(key);
        if (
          key === "client_no_context_takeover" ||
          key === "server_no_context_takeover"
        ) {
          if (value !== undefined) fail("ws_compression_unsupported");
          if (key.startsWith("client"))
            this.compression.clientNoContextTakeover = true;
          else this.compression.serverNoContextTakeover = true;
        } else if (
          key === "client_max_window_bits" ||
          key === "server_max_window_bits"
        ) {
          const bits = Number(value);
          if (!Number.isInteger(bits) || bits < 8 || bits > 15)
            fail("ws_compression_unsupported");
          if (key.startsWith("client"))
            this.compression.clientWindowBits = bits;
          else this.compression.serverWindowBits = bits;
        } else fail("ws_compression_unsupported");
      }
    }
    this.websocket = true;
    this.upgradeContext = context;
    for (const direction of ["client", "server"] as const) {
      const pending = this.http[direction].buffer;
      this.http[direction].buffer = Buffer.alloc(0);
      this.http[direction].awaitingUpgrade = false;
      this.ws[direction].buffer = pending;
      this.parseFrames(direction);
    }
  }

  private parseFrames(direction: ApplicationDirection): void {
    const state = this.ws[direction];
    while (state.buffer.length >= 2) {
      const first = state.buffer[0],
        second = state.buffer[1];
      const final = Boolean(first & 0x80),
        compressed = Boolean(first & 0x40),
        opcode = first & 15;
      const masked = Boolean(second & 0x80);
      if (first & 0x30 || masked !== (direction === "client"))
        fail("ws_invalid_frame");
      let length = second & 127,
        offset = 2;
      if (length === 126) {
        if (state.buffer.length < 4) return;
        length = state.buffer.readUInt16BE(2);
        offset = 4;
        if (length < 126) fail("ws_invalid_frame");
      } else if (length === 127) {
        if (state.buffer.length < 10) return;
        const wide = state.buffer.readBigUInt64BE(2);
        offset = 10;
        if (wide <= 65535n || wide > BigInt(Number.MAX_SAFE_INTEGER))
          fail("ws_invalid_frame");
        length = Number(wide);
      }
      if (length > this.limits.maxFrameBytes) fail("ws_frame_limit");
      if (![0, 1, 2, 8, 9, 10].includes(opcode)) fail("ws_invalid_frame");
      if (opcode >= 8 && (!final || length > 125 || compressed))
        fail("ws_invalid_frame");
      if (compressed && (!this.compression.enabled || opcode !== 1))
        fail("ws_compression_unsupported");
      if (masked) offset += 4;
      if (state.buffer.length < offset + length) return;
      if (++state.frames > this.limits.maxFrames) fail("ws_count_limit");
      const payload = Buffer.from(
        state.buffer.subarray(offset, offset + length),
      );
      if (masked) {
        const mask = state.buffer.subarray(offset - 4, offset);
        for (let index = 0; index < payload.length; index++)
          payload[index] ^= mask[index % 4];
      }
      state.buffer = state.buffer.subarray(offset + length);
      if (opcode >= 8) {
        if (opcode === 8) {
          if (payload.length === 1) fail("ws_invalid_frame");
          if (payload.length >= 2) {
            const code = payload.readUInt16BE(0);
            if (
              code < 1000 ||
              code >= 5000 ||
              [1004, 1005, 1006, 1015].includes(code)
            )
              fail("ws_invalid_frame");
          }
          if (state.fragments) fail("ws_truncated");
          if (payload.length > 2) {
            try {
              new TextDecoder("utf-8", { fatal: true }).decode(
                payload.subarray(2),
              );
            } catch {
              fail("ws_utf8_invalid");
            }
          }
          state.closed = true;
        }
        continue;
      }
      if (state.closed) fail("ws_invalid_frame");
      if (opcode === 2) fail("ws_binary_unsupported");
      if (opcode === 1) {
        if (state.fragments) fail("ws_invalid_frame");
        state.fragments = [];
        state.fragmentBytes = 0;
        state.compressed = compressed;
      } else if (!state.fragments) fail("ws_invalid_frame");
      state.fragmentBytes += payload.length;
      if (state.fragmentBytes > this.limits.maxMessageBytes)
        fail("ws_message_limit");
      state.fragments!.push(payload);
      if (final) this.completeWs(direction);
    }
  }

  private completeWs(direction: ApplicationDirection): void {
    const state = this.ws[direction];
    let body = Buffer.concat(state.fragments!);
    state.fragments = null;
    if (state.compressed) {
      const client = direction === "client";
      const noContext = client
        ? this.compression.clientNoContextTakeover
        : this.compression.serverNoContextTakeover;
      const windowBits = client
        ? this.compression.clientWindowBits
        : this.compression.serverWindowBits;
      try {
        body = inflateRawSync(Buffer.concat([body, deflateTail]), {
          finishFlush: constants.Z_SYNC_FLUSH,
          maxOutputLength: this.limits.maxMessageBytes,
          windowBits,
          ...(state.dictionary.length && !noContext
            ? { dictionary: state.dictionary }
            : {}),
        });
      } catch (error) {
        if (outputLimit(error)) fail("ws_message_limit");
        fail("ws_compression_invalid");
      }
      state.dictionary = noContext
        ? Buffer.alloc(0)
        : Buffer.from(
            Buffer.concat([state.dictionary, body]).subarray(
              -(1 << windowBits),
            ),
          );
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        body,
      );
    } catch {
      fail("ws_utf8_invalid");
    }
    let event: unknown;
    try {
      event = JSON.parse(text);
    } catch {
      fail("ws_json_invalid");
    }
    this.countMessage();
    if (!this.upgradeContext!.model) return;
    if (direction === "client")
      this.callbacks.request(body, this.upgradeContext!.headers);
    else this.callbacks.responseEvent(event);
  }
}
