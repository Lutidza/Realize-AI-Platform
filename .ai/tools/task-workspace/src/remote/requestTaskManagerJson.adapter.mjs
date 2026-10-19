/**
 * @file .ai/tools/task-workspace/src/remote/requestTaskManagerJson.adapter.mjs
 * @version 1.1.0
 * @date 2026-10-19
 * @description Выполняет ограниченный HTTP запрос Task Manager без redirect и раскрытия credentials.
 * @see documentation/specifications/task-management-execution.md
 */
import http from "node:http";
import https from "node:https";

const unavailable = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);
const invalidTls = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "EPROTO",
]);
const transientNetwork = new Set([
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
]);
/** Ограниченный запрос не следует redirect и не передаёт наружу ответ сервера либо credentials.
 * @param {{baseUrl:string,token?:string}} config
 * @param {{method:'GET'|'POST'|'PATCH',path:string,payload?:unknown,requestId?:string}} input
 * @param {{timeoutMs?: number, responseLimit?: number, signal?:AbortSignal}} [limits]
 * @returns {Promise<{kind:'response',status:number,value:unknown}|{kind:'unavailable'|'pending',reason:string}>}
 */
export function requestTaskManagerJson(config, input, limits = {}) {
  const url = new URL(`${config.baseUrl}${input.path}`);
  const body =
    input.payload === undefined ? undefined : JSON.stringify(input.payload);
  return new Promise((resolve) => {
    let connected = false;
    let settled = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    /** @param {{kind:'response',status:number,value:unknown}|{kind:'unavailable'|'pending',reason:string}} result */
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      limits.signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const request = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: input.method,
        agent: false,
        headers: {
          ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
          "content-type": "application/json",
          ...(body === undefined
            ? {}
            : { "content-length": Buffer.byteLength(body) }),
          accept: "application/json",
          ...(input.requestId ? { "idempotency-key": input.requestId } : {}),
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        /** @type {Buffer[]} */
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > (limits.responseLimit ?? 1024 * 1024)) {
            finish({ kind: "pending", reason: "remote_response_limit" });
            response.destroy();
            request.destroy();
          } else chunks.push(chunk);
        });
        response.on("error", () =>
          finish({ kind: "pending", reason: "remote_response_interrupted" }),
        );
        response.on("end", () => {
          if (status < 200 || status >= 300) {
            finish({ kind: "response", status, value: null });
            return;
          }
          try {
            finish({
              kind: "response",
              status,
              value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
            });
          } catch {
            finish({ kind: "pending", reason: "remote_contract_invalid" });
          }
        });
      },
    );
    request.on("socket", (socket) =>
      socket.once("connect", () => {
        connected = true;
      }),
    );
    const abort = () => {
      finish({ kind: "pending", reason: "remote_cancelled" });
      request.destroy();
    };
    limits.signal?.addEventListener("abort", abort, { once: true });
    if (limits.signal?.aborted) {
      abort();
      return;
    }
    request.on("error", (error) => {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code;
      finish(
        code &&
          (invalidTls.has(code) ||
            /CERT|ISSUER|SELF_SIGNED|CRL|INVALID_CA/.test(code) ||
            code.startsWith("ERR_TLS_") ||
            code.startsWith("ERR_SSL_"))
          ? { kind: "pending", reason: "remote_tls_invalid" }
          : !connected && code && unavailable.has(code)
            ? { kind: "unavailable", reason: `remote_${code.toLowerCase()}` }
            : {
                kind: "pending",
                reason:
                  code && transientNetwork.has(code)
                    ? "remote_network_ambiguous"
                    : "remote_transport_error",
              },
      );
    });
    timer = setTimeout(() => {
      finish({ kind: "pending", reason: "remote_timeout" });
      request.destroy();
    }, limits.timeoutMs ?? 10000);
    request.end(body);
  });
}
