/**
 * @file .ai/tools/codex-request-diagnostics/src/applicationStream.types.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Определяет пассивные callbacks, пределы и безопасные коды покрытия HTTP/WS.
 */
import type { Buffer } from "node:buffer";
import type {
  Http2EofDiagnostics,
  Http2StreamCoverageCode,
} from "./http2Stream.types.ts";

export type ApplicationStreamCoverageCode =
  | Http2StreamCoverageCode
  | "http2_unsupported"
  | "http1_invalid_headers"
  | "http1_headers_limit"
  | "http1_invalid_framing"
  | "http1_body_limit"
  | "http1_request_count_limit"
  | "http1_truncated"
  | "http1_upgrade_invalid"
  | "content_encoding_unsupported"
  | "content_encoding_invalid"
  | "request_json_invalid"
  | "response_json_invalid"
  | "response_content_type_unsupported"
  | "response_event_limit"
  | "ws_invalid_frame"
  | "ws_compression_unsupported"
  | "ws_compression_invalid"
  | "ws_binary_unsupported"
  | "ws_frame_limit"
  | "ws_message_limit"
  | "ws_count_limit"
  | "ws_utf8_invalid"
  | "ws_json_invalid"
  | "ws_truncated"
  | "callback_failed";

export type ApplicationRequestHeaders = Readonly<Record<string, string>>;

/** Headers и body предназначены только для обработки в памяти; callbacks не меняют forwarding. */
export interface ApplicationStreamCallbacks {
  request(body: Buffer, headers: ApplicationRequestHeaders): void;
  /** H2 передаёт request snapshot для correlation по stream ID; metadata не входит в relay. */
  responseEvent(
    value: unknown,
    requestHeaders?: ApplicationRequestHeaders,
  ): void;
  coverage(
    code: ApplicationStreamCoverageCode,
    http2Eof?: Http2EofDiagnostics,
  ): void;
}

export interface ApplicationStreamLimits {
  maxHeadersBytes: number;
  maxHeaderCount: number;
  maxPendingRequests: number;
  maxBodyBytes: number;
  maxFrameBytes: number;
  maxMessageBytes: number;
  maxEventBytes: number;
  maxFrames: number;
  maxMessages: number;
}

export type ApplicationDirection = "client" | "server";

export interface ApplicationHttpContext {
  method: string;
  path: string;
  headers: ApplicationRequestHeaders;
  model: boolean;
  upgrade: boolean;
}

export interface ApplicationHttpMessage {
  context: ApplicationHttpContext;
  headers: ApplicationRequestHeaders;
  status: number | null;
  mode: "length" | "chunked" | "close" | "none";
  remaining: number;
  chunkPhase: "size" | "data" | "data_end" | "trailers";
  chunks: Buffer[];
  bytes: number;
}

export interface ApplicationHttpState {
  buffer: Buffer;
  message: ApplicationHttpMessage | null;
  awaitingUpgrade: boolean;
}

export interface ApplicationWsCompression {
  enabled: boolean;
  clientNoContextTakeover: boolean;
  serverNoContextTakeover: boolean;
  clientWindowBits: number;
  serverWindowBits: number;
}

export interface ApplicationWsState {
  buffer: Buffer;
  fragments: Buffer[] | null;
  fragmentBytes: number;
  compressed: boolean;
  dictionary: Buffer;
  frames: number;
  closed: boolean;
}
