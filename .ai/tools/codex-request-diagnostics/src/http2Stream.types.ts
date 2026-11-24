/**
 * @file .ai/tools/codex-request-diagnostics/src/http2Stream.types.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Определяет callbacks и пределы изолированных RAM-декодеров HTTP/2.
 */
import type { Buffer } from "node:buffer";
import type { ApplicationRequestHeaders } from "./applicationStream.types.ts";

export type Http2StreamCoverageCode =
  | "http2_invalid_preface"
  | "http2_frame_limit"
  | "http2_count_limit"
  | "http2_stream_limit"
  | "http2_headers_limit"
  | "http2_body_limit"
  | "http2_buffer_limit"
  | "http2_decode_error"
  | "http2_unknown_stream"
  | "http2_push_unsupported"
  | "http2_truncated"
  | "http2_drain_incomplete"
  | "http2_callback_failed";

/** Только bounded counts и flags EOF; никаких headers, paths, stream IDs или native bytes. */
export interface Http2EofDiagnostics {
  readonly clientEnded: boolean;
  readonly serverEnded: boolean;
  readonly gotPreface: boolean;
  readonly clientSettings: boolean;
  readonly serverSettings: boolean;
  readonly clientHeaderPending: boolean;
  readonly serverHeaderPending: boolean;
  readonly clientBufferBytes: number;
  readonly serverBufferBytes: number;
  readonly serverQueueFrames: number;
  readonly decodedModelStreams: number;
  readonly decodedNonmodelStreams: number;
  readonly unfinishedModelRequests: number;
  readonly unfinishedModelResponses: number;
  readonly unknownExpectedStreams: number;
}

/** Body ещё содержит HTTP content-encoding; transfer framing уже снят встроенным декодером. */
export interface Http2StreamCallbacks {
  request(body: Buffer, headers: ApplicationRequestHeaders): void;
  response(
    body: Buffer,
    headers: ApplicationRequestHeaders,
    requestHeaders: ApplicationRequestHeaders,
  ): void;
  coverage(code: Http2StreamCoverageCode, http2Eof?: Http2EofDiagnostics): void;
}

export interface Http2StreamLimits {
  maxFrameBytes: number;
  maxFrames: number;
  maxStreams: number;
  maxHeadersBytes: number;
  maxBodyBytes: number;
  maxBufferedBytes: number;
}

export interface Http2ObservedStream {
  headers: ApplicationRequestHeaders;
  model: boolean;
  requestChunks: Buffer[];
  requestBytes: number;
  requestEnded: boolean;
  requestHeaderBlocks: number;
  responseHeaders: ApplicationRequestHeaders | null;
  responseChunks: Buffer[];
  responseBytes: number;
  responseEnded: boolean;
  responseHeaderBlocks: number;
}

export interface Http2WireState {
  buffer: Buffer;
  frames: number;
  settingsAckPassed: boolean;
  headerStream: number | null;
  headerEnd: boolean;
}

export interface Http2WireStream {
  clientBytes: number;
  serverBytes: number;
  clientHeaderBlocks: number;
  serverHeaderBlocks: number;
  clientEnd: boolean;
  serverEnd: boolean;
}
