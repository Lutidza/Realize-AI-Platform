/**
 * @file .ai/tools/codex-request-diagnostics/src/connectVerifiedUpstream.service.ts
 * @version 1.0.0
 * @date 2026-11-20
 * @description Ограничивает повтор upstream TLS этапом до передачи application bytes и выдаёт закрытую диагностику.
 */
import type { TLSSocket } from "node:tls";
import type {
  RelayTlsErrorClass,
  RelayUpstreamAttempt,
  RelayUpstreamFailure,
} from "./diagnosticRelay.types.ts";

const RETRY_DELAY_MS = 100;
const DEADLINE_MS = 15_000;
const TRANSIENT = new Set<RelayTlsErrorClass>([
  "reset",
  "timeout",
  "dns_temporary",
  "refused",
  "unreachable",
  "remote_internal",
  "peer_closed",
]);
const ERROR_CODES: Readonly<Record<string, RelayTlsErrorClass>> = Object.freeze(
  {
    ECONNRESET: "reset",
    ETIMEDOUT: "timeout",
    EAI_AGAIN: "dns_temporary",
    ECONNREFUSED: "refused",
    ENETUNREACH: "unreachable",
    EHOSTUNREACH: "unreachable",
    ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR: "remote_internal",
    ERR_SSL_UNEXPECTED_EOF_WHILE_READING: "peer_closed",
    ERR_TLS_CERT_ALTNAME_INVALID: "certificate",
    CERT_HAS_EXPIRED: "certificate",
    CERT_NOT_YET_VALID: "certificate",
    DEPTH_ZERO_SELF_SIGNED_CERT: "certificate",
    SELF_SIGNED_CERT_IN_CHAIN: "certificate",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "certificate",
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "certificate",
    CERT_REVOKED: "certificate",
    ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE: "protocol",
    ERR_SSL_WRONG_VERSION_NUMBER: "protocol",
  },
);

/** Читает только exact code; неизвестные строки и AggregateError не выводятся и не повторяются. */
export function classifyUpstreamTlsError(error: unknown): RelayTlsErrorClass {
  try {
    if (error instanceof AggregateError) return "other";
    const code =
      error && typeof error === "object" && "code" in error ? error.code : null;
    return typeof code === "string" && Object.hasOwn(ERROR_CODES, code)
      ? ERROR_CODES[code]!
      : "other";
  } catch {
    return "other";
  }
}

interface Options {
  connection: number;
  signal: AbortSignal;
  dial(attempt: 1 | 2): TLSSocket;
  verified(socket: TLSSocket, attempt: 1 | 2): void;
  failed(details: RelayUpstreamFailure): void;
  attempt(event: RelayUpstreamAttempt): void;
  /** Только local fixture; relay/CLI не предоставляют override общего deadline. */
  deadlineMs?: number;
}

/**
 * Сначала TLS verification; application pipe создаёт вызывающий код только в verified.
 * Единственный повтор разрешён closed transient class до secure handoff, под общим deadline.
 * После handoff, при certificate/unknown failure и при отмене новых dials нет.
 */
export function connectVerifiedUpstream(options: Options): void {
  const deadlineMs = options.deadlineMs ?? DEADLINE_MS;
  if (
    !Number.isSafeInteger(deadlineMs) ||
    deadlineMs <= 0 ||
    deadlineMs > DEADLINE_MS
  )
    throw new Error("invalid_upstream_deadline");
  let attempt: 1 | 2 = 1;
  let stage: RelayUpstreamAttempt["stage"] = "connecting";
  let socket: TLSSocket | undefined;
  let stopped = false,
    settled = false;
  let lastFailure: RelayUpstreamFailure | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const deadlineAt = performance.now() + deadlineMs;
  const clear = () => {
    clearTimeout(deadline);
    if (retry) clearTimeout(retry);
    options.signal.removeEventListener("abort", cancel);
  };
  const emit = (
    outcome: RelayUpstreamAttempt["outcome"],
    errorClass: RelayTlsErrorClass | null,
  ) =>
    options.attempt({
      connection: options.connection,
      attempt,
      stage,
      outcome,
      errorClass,
      applicationForwarded: false,
    });
  const fatal = (failure: RelayUpstreamFailure) => {
    stopped = true;
    clear();
    socket?.destroy();
    options.failed(failure);
  };
  function cancel() {
    if (stopped) return;
    stopped = true;
    clear();
    emit("cancelled", null);
    socket?.destroy();
    // Не превращаем уже случившийся upstream failure в успешную отмену между attempts.
    if (lastFailure) options.failed(lastFailure);
  }
  function failure(errorClass: RelayTlsErrorClass) {
    if (stopped || settled) return;
    settled = true;
    lastFailure = { attempt, stage, errorClass, applicationForwarded: false };
    socket?.destroy();
    if (
      attempt === 1 &&
      TRANSIENT.has(errorClass) &&
      performance.now() + RETRY_DELAY_MS < deadlineAt
    ) {
      emit("retrying", errorClass);
      retry = setTimeout(() => {
        if (performance.now() >= deadlineAt) {
          settled = false;
          failure("timeout");
          return;
        }
        attempt = 2;
        start();
      }, RETRY_DELAY_MS);
    } else {
      emit("failed", errorClass);
      fatal(lastFailure);
    }
  }
  function start() {
    if (stopped || options.signal.aborted) {
      cancel();
      return;
    }
    settled = false;
    stage = "connecting";
    if (performance.now() >= deadlineAt) {
      failure("timeout");
      return;
    }
    let current: TLSSocket;
    try {
      current = options.dial(attempt);
    } catch (error) {
      failure(classifyUpstreamTlsError(error));
      return;
    }
    socket = current;
    // Listener остаётся при destroy/handoff: поздний error не становится unhandled exception.
    current.on("error", (error) => {
      if (socket === current) failure(classifyUpstreamTlsError(error));
    });
    current.once("connect", () => {
      if (!stopped && socket === current) stage = "upstream_tls";
    });
    current.once("close", () => {
      if (socket === current) failure("peer_closed");
    });
    current.once("secureConnect", () => {
      if (stopped || settled || options.signal.aborted || socket !== current)
        return;
      if (performance.now() >= deadlineAt) {
        failure("timeout");
        return;
      }
      if (!current.authorized) {
        failure("certificate");
        return;
      }
      settled = true;
      stopped = true;
      clear();
      emit("connected", null);
      try {
        options.verified(current, attempt);
      } catch {
        current.destroy();
        options.failed({
          attempt,
          stage,
          errorClass: "observer",
          applicationForwarded: false,
        });
      }
    });
  }
  const deadline = setTimeout(() => {
    if (stopped) return;
    settled = false;
    failure("timeout");
  }, deadlineMs);
  options.signal.addEventListener("abort", cancel, { once: true });
  start();
}
