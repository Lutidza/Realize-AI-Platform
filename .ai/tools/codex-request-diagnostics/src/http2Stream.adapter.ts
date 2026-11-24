/**
 * @file .ai/tools/codex-request-diagnostics/src/http2Stream.adapter.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Декодирует копии H2 frames встроенными RAM sessions без сети и изменения relay bytes.
 */
import { connect, constants, performServerHandshake } from "node:http2";
import type {
  ClientHttp2Session,
  ClientHttp2Stream,
  IncomingHttpHeaders,
  ServerHttp2Session,
} from "node:http2";
import { Duplex } from "node:stream";
import { setImmediate } from "node:timers/promises";
import type { ApplicationRequestHeaders } from "./applicationStream.types.ts";
import type {
  Http2EofDiagnostics,
  Http2ObservedStream,
  Http2StreamCallbacks,
  Http2StreamCoverageCode,
  Http2StreamLimits,
  Http2WireState,
  Http2WireStream,
} from "./http2Stream.types.ts";

const preface = Buffer.from("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n");
const limitsDefault: Http2StreamLimits = {
  maxFrameBytes: 1024 * 1024,
  maxFrames: 100_000,
  maxStreams: 1024,
  maxHeadersBytes: 64 * 1024,
  maxBodyBytes: 16 * 1024 * 1024,
  maxBufferedBytes: 32 * 1024 * 1024,
};
const wireState = (): Http2WireState => ({
  buffer: Buffer.alloc(0),
  frames: 0,
  settingsAckPassed: false,
  headerStream: null,
  headerEnd: false,
});

/** Любые generated SETTINGS/ACK/HEADERS/RST остаются в этом sink и никогда не входят в relay. */
class DecoderSocket extends Duplex {
  _read(): void {}
  _write(
    _chunk: Buffer,
    _encoding: BufferEncoding,
    done: (error?: Error | null) => void,
  ): void {
    done();
  }
}

/**
 * Два независимых HTTP/2 decoders получают только копии фактических frames.
 * Внутренние fake requests нужны клиентскому decoder для регистрации исходных stream IDs.
 */
export class Http2StreamTap {
  private readonly limits: Http2StreamLimits;
  private readonly requestSocket = new DecoderSocket();
  private readonly responseSocket = new DecoderSocket();
  private readonly requestDecoder: ServerHttp2Session;
  private readonly responseDecoder: ClientHttp2Session;
  private readonly wires = { client: wireState(), server: wireState() };
  private readonly streams = new Map<number, Http2ObservedStream>();
  private readonly expected = new Map<number, Http2WireStream>();
  private readonly mirrors = new Map<number, ClientHttp2Stream>();
  private readonly readyStreams = new Set<number>();
  private readonly serverQueue: Buffer[] = [];
  private serverQueueBytes = 0;
  private nextMirror = 1;
  private gotPreface = false;
  private clientSettings = false;
  private serverSettings = false;
  private disabled = false;
  private closing = false;
  private clientEnded = false;
  private serverEnded = false;
  private finishing: Promise<void> | null = null;

  constructor(
    private readonly callbacks: Http2StreamCallbacks,
    limits: Partial<Http2StreamLimits> = {},
  ) {
    this.limits = { ...limitsDefault, ...limits };
    if (
      Object.values(this.limits).some(
        (value) => !Number.isSafeInteger(value) || value < 1,
      )
    )
      throw new Error("invalid_http2_stream_limit");
    const settings = {
      initialWindowSize: 0x7fffffff,
      headerTableSize: this.limits.maxHeadersBytes,
      maxHeaderListSize: this.limits.maxHeadersBytes,
      maxFrameSize: Math.max(
        16384,
        Math.min(16777215, this.limits.maxFrameBytes),
      ),
    };
    this.requestDecoder = performServerHandshake(this.requestSocket, {
      settings,
      maxSessionMemory: 32,
    });
    // createConnection исключает DNS/TCP/TLS; URL задаёт лишь внутренние dummy pseudoheaders.
    this.responseDecoder = connect("http://passive-observer.invalid", {
      createConnection: () => this.responseSocket,
      settings: { ...settings, enablePush: false },
      maxSessionMemory: 32,
    });
    this.requestDecoder.setLocalWindowSize(0x7fffffff);
    this.responseDecoder.on("connect", () => {
      if (!this.closing) this.responseDecoder.setLocalWindowSize(0x7fffffff);
    });
    for (const session of [this.requestDecoder, this.responseDecoder]) {
      session.on("error", () => this.fail("http2_decode_error"));
      session.on("frameError", () => this.fail("http2_decode_error"));
      session.on("goaway", (code) => {
        if (code !== constants.NGHTTP2_NO_ERROR)
          this.fail("http2_decode_error");
      });
    }
    this.requestSocket.on("error", () => this.fail("http2_decode_error"));
    this.responseSocket.on("error", () => this.fail("http2_decode_error"));
    this.responseDecoder.on("stream", (stream) => {
      stream.on("error", () => {});
      this.fail("http2_push_unsupported");
    });
    this.requestDecoder.on("stream", (stream, headers) => {
      stream.on("error", () => this.fail("http2_decode_error"));
      const id = stream.id;
      if (id === undefined || this.disabled || this.closing) {
        stream.on("error", () => {});
        return;
      }
      const normalized = this.headers(headers);
      if (!normalized) return;
      if (this.streams.size >= this.limits.maxStreams || this.streams.has(id)) {
        this.fail("http2_stream_limit");
        return;
      }
      const context: Http2ObservedStream = {
        // Только RAM snapshot: поле не отправляется ни реальному peer, ни decoder request.
        headers: Object.freeze({
          ...normalized,
          ":diagnostic-stream-id": String(id),
        }),
        model:
          normalized[":method"] === "POST" &&
          (normalized[":path"] ?? "").split("?")[0].endsWith("/responses"),
        requestChunks: [],
        requestBytes: 0,
        requestEnded: false,
        requestHeaderBlocks: 1,
        responseHeaders: null,
        responseChunks: [],
        responseBytes: 0,
        responseEnded: false,
        responseHeaderBlocks: 0,
      };
      this.streams.set(id, context);
      stream.on("trailers", () => {
        context.requestHeaderBlocks++;
      });
      stream.on("data", (data: Buffer) => {
        if (this.disabled || this.closing) return;
        context.requestBytes += data.length;
        if (context.requestBytes > this.limits.maxBodyBytes)
          this.fail("http2_body_limit");
        else if (context.model && !this.disabled)
          context.requestChunks.push(Buffer.from(data));
      });
      stream.on("end", () => {
        context.requestEnded = true;
        if (context.model && !this.disabled && !this.closing)
          this.callback(() =>
            this.callbacks.request(
              Buffer.concat(context.requestChunks),
              context.headers,
            ),
          );
        context.requestChunks = [];
      });
      this.createMirrorsThrough(id);
    });
  }

  clientData(chunk: Uint8Array): void {
    this.feed("client", chunk);
  }
  serverData(chunk: Uint8Array): void {
    this.feed("server", chunk);
  }
  endClient(): void {
    this.clientEnded = true;
  }
  endServer(): void {
    this.serverEnded = true;
  }

  /** Ждёт обработки уже наблюдённых полных frames, не закрывая живое соединение между phases. */
  async flush(): Promise<void> {
    for (
      let attempt = 0;
      attempt < 100 && !this.disabled && !this.closing;
      attempt++
    ) {
      await setImmediate();
      this.drainServer();
      if (this.synchronized()) return;
    }
    if (!this.disabled && !this.closing) this.fail("http2_drain_incomplete");
  }

  /** Вызывается после обоих EOF; дожидается nghttp2 callbacks и уничтожает только RAM sessions. */
  finish(): Promise<void> {
    this.finishing ??= this.finalize();
    return this.finishing;
  }

  /** Аварийно прекращает только наблюдение, сохраняя внешние sockets нетронутыми. */
  dispose(): void {
    if (this.closing) return;
    this.closing = true;
    this.requestDecoder.destroy();
    this.responseDecoder.destroy();
    this.requestSocket.destroy();
    this.responseSocket.destroy();
    this.serverQueue.length = 0;
    for (const wire of Object.values(this.wires)) wire.buffer = Buffer.alloc(0);
    for (const context of this.streams.values()) {
      context.requestChunks = [];
      context.responseChunks = [];
    }
    this.streams.clear();
    this.expected.clear();
    this.mirrors.clear();
    this.readyStreams.clear();
  }

  private async finalize(): Promise<void> {
    // Обработка собственных Duplex buffers и events завершается до финальной оценки покрытия.
    await this.flush();
    if (!this.disabled && !this.closing) {
      if (
        !this.clientEnded ||
        !this.serverEnded ||
        !this.gotPreface ||
        !this.clientSettings ||
        !this.serverSettings ||
        this.wires.client.buffer.length ||
        this.wires.server.buffer.length ||
        this.wires.client.headerStream !== null ||
        this.wires.server.headerStream !== null ||
        this.serverQueue.length ||
        [...this.streams.values()].some(
          // Полные wire frames фонового GET не доказывают потерю model coverage.
          (stream) =>
            stream.model && (!stream.requestEnded || !stream.responseEnded),
        )
      )
        this.fail("http2_truncated", this.eofDiagnostics());
    }
    this.dispose();
  }

  private synchronized(): boolean {
    if (
      this.requestSocket.readableLength ||
      this.responseSocket.readableLength ||
      this.serverQueue.length
    )
      return false;
    for (const [id, expected] of this.expected) {
      const actual = this.streams.get(id);
      if (
        !actual ||
        actual.requestBytes !== expected.clientBytes ||
        actual.responseBytes !== expected.serverBytes ||
        actual.requestHeaderBlocks !== expected.clientHeaderBlocks ||
        actual.responseHeaderBlocks !== expected.serverHeaderBlocks ||
        (expected.clientEnd && !actual.requestEnded) ||
        (expected.serverEnd && !actual.responseEnded)
      )
        return false;
    }
    return true;
  }

  private callback(operation: () => void): void {
    if (this.disabled || this.closing) return;
    try {
      operation();
    } catch {
      this.fail("http2_callback_failed");
    }
  }

  private eofDiagnostics(): Http2EofDiagnostics {
    const streams = [...this.streams.values()];
    return Object.freeze({
      clientEnded: this.clientEnded,
      serverEnded: this.serverEnded,
      gotPreface: this.gotPreface,
      clientSettings: this.clientSettings,
      serverSettings: this.serverSettings,
      clientHeaderPending: this.wires.client.headerStream !== null,
      serverHeaderPending: this.wires.server.headerStream !== null,
      clientBufferBytes: this.wires.client.buffer.length,
      serverBufferBytes: this.wires.server.buffer.length,
      serverQueueFrames: this.serverQueue.length,
      decodedModelStreams: streams.filter((stream) => stream.model).length,
      decodedNonmodelStreams: streams.filter((stream) => !stream.model).length,
      unfinishedModelRequests: streams.filter(
        (stream) => stream.model && !stream.requestEnded,
      ).length,
      unfinishedModelResponses: streams.filter(
        (stream) => stream.model && !stream.responseEnded,
      ).length,
      unknownExpectedStreams: [...this.expected.keys()].filter(
        (id) => !this.streams.has(id),
      ).length,
    });
  }

  private fail(
    code: Http2StreamCoverageCode,
    http2Eof?: Http2EofDiagnostics,
  ): void {
    if (this.disabled || this.closing) return;
    this.disabled = true;
    try {
      this.callbacks.coverage(
        code,
        code === "http2_truncated" ? http2Eof : undefined,
      );
    } catch {
      /* Coverage callback не влияет на внешний relay. */
    }
    this.dispose();
  }

  private headers(
    input: IncomingHttpHeaders,
  ): ApplicationRequestHeaders | null {
    const output: Record<string, string> = Object.create(null);
    let bytes = 0;
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      const text = Array.isArray(value) ? value.join(", ") : String(value);
      bytes += Buffer.byteLength(key) + Buffer.byteLength(text) + 2;
      if (bytes > this.limits.maxHeadersBytes) {
        this.fail("http2_headers_limit");
        return null;
      }
      output[key.toLowerCase()] = text;
    }
    return Object.freeze(output);
  }

  private createMirrorsThrough(id: number): void {
    if (id % 2 !== 1 || (id + 1) / 2 > this.limits.maxStreams) {
      this.fail("http2_stream_limit");
      return;
    }
    try {
      while (this.nextMirror <= id && !this.disabled) {
        const expected = this.nextMirror;
        this.nextMirror += 2;
        const mirror = this.responseDecoder.request(
          { ":method": "GET", ":path": "/" },
          { endStream: true },
        );
        this.mirrors.set(expected, mirror);
        const dummy = expected !== id;
        mirror.on("error", () => {
          if (!dummy) this.fail("http2_decode_error");
        });
        mirror.on("ready", () => {
          if (this.closing) return;
          if (mirror.id !== expected) {
            this.fail("http2_unknown_stream");
            return;
          }
          this.readyStreams.add(expected);
          if (dummy) mirror.close(constants.NGHTTP2_CANCEL);
          this.drainServer();
        });
        if (mirror.id !== undefined) {
          if (mirror.id !== expected) {
            this.fail("http2_unknown_stream");
            return;
          }
          this.readyStreams.add(expected);
          if (dummy) mirror.close(constants.NGHTTP2_CANCEL);
        }
        mirror.on("response", (headers) => {
          const context = this.streams.get(expected);
          if (!context) {
            this.fail("http2_unknown_stream");
            return;
          }
          context.responseHeaders = this.headers(headers);
          context.responseHeaderBlocks++;
        });
        mirror.on("headers", () => {
          const context = this.streams.get(expected);
          if (context) context.responseHeaderBlocks++;
        });
        mirror.on("trailers", () => {
          const context = this.streams.get(expected);
          if (context) context.responseHeaderBlocks++;
        });
        mirror.on("data", (data: Buffer) => {
          if (this.disabled || this.closing) return;
          const context = this.streams.get(expected);
          if (!context) {
            this.fail("http2_unknown_stream");
            return;
          }
          context.responseBytes += data.length;
          if (context.responseBytes > this.limits.maxBodyBytes)
            this.fail("http2_body_limit");
          else if (context.model && !this.disabled)
            context.responseChunks.push(Buffer.from(data));
        });
        mirror.on("end", () => {
          if (dummy) return;
          const context = this.streams.get(expected);
          if (!context || !context.responseHeaders) {
            this.fail("http2_unknown_stream");
            return;
          }
          context.responseEnded = true;
          if (context.model && !this.disabled && !this.closing)
            this.callback(() =>
              this.callbacks.response(
                Buffer.concat(context.responseChunks),
                context.responseHeaders!,
                context.headers,
              ),
            );
          context.responseChunks = [];
        });
      }
      this.drainServer();
    } catch {
      this.fail("http2_decode_error");
    }
  }

  private push(socket: DecoderSocket, bytes: Buffer): void {
    if (this.disabled || this.closing) return;
    if (socket.readableLength + bytes.length > this.limits.maxBufferedBytes) {
      this.fail("http2_buffer_limit");
      return;
    }
    socket.push(Buffer.from(bytes));
  }

  private feed(direction: "client" | "server", data: Uint8Array): void {
    if (this.disabled || this.closing) return;
    try {
      const state = this.wires[direction];
      for (
        let offset = 0;
        offset < data.length && !this.disabled;
        offset += 64 * 1024
      ) {
        if (
          state.buffer.length + Math.min(64 * 1024, data.length - offset) >
          this.limits.maxBufferedBytes
        ) {
          this.fail("http2_buffer_limit");
          return;
        }
        state.buffer = Buffer.concat([
          state.buffer,
          Buffer.from(data.subarray(offset, offset + 64 * 1024)),
        ]);
        if (direction === "client" && !this.gotPreface) {
          const length = Math.min(state.buffer.length, preface.length);
          if (
            !state.buffer
              .subarray(0, length)
              .equals(preface.subarray(0, length))
          ) {
            this.fail("http2_invalid_preface");
            return;
          }
          if (state.buffer.length < preface.length) continue;
          this.gotPreface = true;
          this.push(
            this.requestSocket,
            state.buffer.subarray(0, preface.length),
          );
          state.buffer = state.buffer.subarray(preface.length);
        }
        while (state.buffer.length >= 9 && !this.disabled) {
          const length = state.buffer.readUIntBE(0, 3);
          if (length > this.limits.maxFrameBytes) {
            this.fail("http2_frame_limit");
            return;
          }
          if (state.buffer.length < length + 9) break;
          if (++state.frames > this.limits.maxFrames) {
            this.fail("http2_count_limit");
            return;
          }
          const frame = Buffer.from(state.buffer.subarray(0, length + 9));
          state.buffer = state.buffer.subarray(length + 9);
          // ACK относится к реальному peer SETTINGS, не к дополнительной активности decoder.
          if (frame[3] === 4 && frame[4] & 1) {
            if (state.settingsAckPassed) continue;
            state.settingsAckPassed = true;
          }
          if (frame[3] === 4 && !(frame[4] & 1)) {
            if (direction === "client") this.clientSettings = true;
            else this.serverSettings = true;
          }
          this.noteFrame(direction, frame);
          if (this.disabled) return;
          if (direction === "client") this.push(this.requestSocket, frame);
          else {
            if (frame[3] === 5) {
              this.fail("http2_push_unsupported");
              return;
            }
            this.serverQueueBytes += frame.length;
            if (this.serverQueueBytes > this.limits.maxBufferedBytes) {
              this.fail("http2_buffer_limit");
              return;
            }
            this.serverQueue.push(frame);
            this.drainServer();
          }
        }
      }
    } catch {
      this.fail("http2_decode_error");
    }
  }

  private noteFrame(direction: "client" | "server", frame: Buffer): void {
    const state = this.wires[direction],
      type = frame[3],
      flags = frame[4];
    const stream = frame.readUInt32BE(5) & 0x7fffffff;
    if (!stream || ![0, 1, 9].includes(type)) return;
    let expected = this.expected.get(stream);
    if (!expected) {
      if (this.expected.size >= this.limits.maxStreams) {
        this.fail("http2_stream_limit");
        return;
      }
      expected = {
        clientBytes: 0,
        serverBytes: 0,
        clientHeaderBlocks: 0,
        serverHeaderBlocks: 0,
        clientEnd: false,
        serverEnd: false,
      };
      this.expected.set(stream, expected);
    }
    if (type === 0) {
      let length = frame.length - 9;
      if (flags & 8) {
        if (!length || frame[9] + 1 > length) {
          this.fail("http2_decode_error");
          return;
        }
        length -= frame[9] + 1;
      }
      if (direction === "client") expected.clientBytes += length;
      else expected.serverBytes += length;
      if (flags & 1) {
        if (direction === "client") expected.clientEnd = true;
        else expected.serverEnd = true;
      }
    } else {
      if (type === 1) {
        state.headerStream = stream;
        state.headerEnd = Boolean(flags & 1);
      } else if (state.headerStream !== stream) {
        this.fail("http2_decode_error");
        return;
      }
      if (flags & 4) {
        if (direction === "client") {
          expected.clientHeaderBlocks++;
          if (state.headerEnd) expected.clientEnd = true;
        } else {
          expected.serverHeaderBlocks++;
          if (state.headerEnd) expected.serverEnd = true;
        }
        state.headerStream = null;
        state.headerEnd = false;
      }
    }
  }

  private drainServer(): void {
    while (this.serverQueue.length && !this.disabled && !this.closing) {
      const frame = this.serverQueue[0];
      const stream = frame.readUInt32BE(5) & 0x7fffffff;
      if (stream && !this.readyStreams.has(stream)) return;
      this.serverQueue.shift();
      this.serverQueueBytes -= frame.length;
      this.push(this.responseSocket, frame);
    }
  }
}
