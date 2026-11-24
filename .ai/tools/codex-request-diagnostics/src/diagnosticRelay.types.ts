/**
 * @file .ai/tools/codex-request-diagnostics/src/diagnosticRelay.types.ts
 * @version 1.0.0
 * @date 2026-11-20
 * @description Определяет закрытый контракт временного CONNECT relay и его безопасных событий.
 */
import type { ApplicationStreamCoverageCode } from "./applicationStream.types.ts";
import type { Http2EofDiagnostics } from "./http2Stream.types.ts";
import type { RequestObservationContext } from "./requestFingerprint.types.ts";
import type { TLSSocket } from "node:tls";

export type ClientHelloResult =
  | { state: "pending" }
  | { state: "invalid" }
  | { state: "complete"; servername: string; protocols: string[] };

export interface EphemeralCertificate {
  certificate: Buffer;
  privateKey: Buffer;
  trustCertificate: Buffer;
}

export type RelayCoverageCode =
  | ApplicationStreamCoverageCode
  | "client_hello_invalid"
  | "destination_rejected"
  | "upstream_tls_failed"
  | "downstream_tls_failed"
  | "alpn_mismatch"
  | "connection_budget_exceeded"
  | "observer_failed";

/** Закрытая классификация: тексты ошибок, stacks, адреса и сертификаты не входят в evidence. */
export type RelayTlsErrorClass =
  | "reset"
  | "timeout"
  | "dns_temporary"
  | "refused"
  | "unreachable"
  | "remote_internal"
  | "peer_closed"
  | "certificate"
  | "protocol"
  | "observer"
  | "other";

export interface RelayUpstreamFailure {
  attempt: 1 | 2;
  stage: "connecting" | "upstream_tls" | "downstream_tls";
  errorClass: RelayTlsErrorClass;
  applicationForwarded: false;
}

export interface RelayUpstreamAttempt {
  connection: number;
  attempt: 1 | 2;
  stage: "connecting" | "upstream_tls";
  outcome: "connected" | "retrying" | "failed" | "cancelled";
  errorClass: RelayTlsErrorClass | null;
  applicationForwarded: false;
}

/** Обработчики получают данные только в памяти; записывать можно лишь их allowlisted проекцию. */
export interface DiagnosticRelayCallbacks {
  request(
    body: Buffer,
    context: RequestObservationContext & {
      physicalConnection: number;
      streamIndex?: number;
    },
  ): void;
  responseEvent(
    value: unknown,
    connection: number,
    physicalConnection: number,
    streamIndex?: number,
  ): void;
  coverage(
    code: RelayCoverageCode,
    connection: number,
    http2Eof?: Http2EofDiagnostics,
    upstreamFailure?: RelayUpstreamFailure,
  ): void;
  /** Все pre-application TLS attempts, включая восстановленные; только закрытая проекция. */
  upstreamAttempt?(event: RelayUpstreamAttempt): void;
  /** Только отказ CONNECT до upstream dial и до передачи application bytes. */
  policyRejection?(connection: number): void;
}

export interface DiagnosticRelay {
  /** Содержит временный proxy credential: передавать только spawn.env, никогда не сериализовать. */
  childEnvironment: Readonly<Record<string, string>>;
  publicCertificatePath: string;
  flush(): Promise<void>;
  snapshot(): {
    connections: number;
    tlsEstablished: number;
    clientApplicationBytes: number;
    serverApplicationBytes: number;
    upstreamDials: number;
    upstreamRetryDials: number;
    upstreamRecoveries: number;
  };
  close(): Promise<void>;
}

export interface DiagnosticRelayOptions extends DiagnosticRelayCallbacks {
  /** Инъекция транспорта для локальных TLS fixtures; CLI этот параметр не принимает. */
  connectUpstream?(host: string, protocols: readonly string[]): TLSSocket;
}
