/**
 * @file .ai/tools/codex-request-diagnostics/src/clientHello.util.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Читает только SNI и ALPN открытого TLS ClientHello для согласования relay.
 */
import type { ClientHelloResult } from "./diagnosticRelay.types.ts";

/** Не интерпретирует зашифрованные records; незавершённый handshake требует новых байтов. */
export function readClientHello(data: Buffer): ClientHelloResult {
  if (data.length > 65536) return { state: "invalid" };
  let offset = 0;
  const fragments: Buffer[] = [];
  while (offset + 5 <= data.length) {
    const size = data.readUInt16BE(offset + 3);
    if (size > 18432 || data[offset] !== 22) return { state: "invalid" };
    if (offset + 5 + size > data.length) return { state: "pending" };
    fragments.push(data.subarray(offset + 5, offset + 5 + size));
    const hello = Buffer.concat(fragments);
    if (hello.length >= 4) {
      if (hello[0] !== 1) return { state: "invalid" };
      const length = hello.readUIntBE(1, 3);
      if (length + 4 > 65536) return { state: "invalid" };
      if (hello.length >= length + 4) {
        try {
          let p = 4 + 2 + 32;
          p += 1 + hello[p];
          p += 2 + hello.readUInt16BE(p);
          p += 1 + hello[p];
          const end = p + 2 + hello.readUInt16BE(p);
          p += 2;
          if (end !== length + 4) return { state: "invalid" };
          let servername: string | undefined;
          const protocols: string[] = [];
          while (p < end) {
            const kind = hello.readUInt16BE(p);
            const n = hello.readUInt16BE(p + 2);
            const start = p + 4;
            const next = start + n;
            if (next > end) return { state: "invalid" };
            if (kind === 0) {
              if (
                n < 5 ||
                hello.readUInt16BE(start) + 2 !== n ||
                hello[start + 2] !== 0
              )
                return { state: "invalid" };
              const len = hello.readUInt16BE(start + 3);
              if (len + 5 !== n || servername !== undefined)
                return { state: "invalid" };
              servername = hello.subarray(start + 5, next).toString("ascii");
            } else if (kind === 16) {
              if (n < 2 || hello.readUInt16BE(start) + 2 !== n)
                return { state: "invalid" };
              for (let q = start + 2; q < next;) {
                const len = hello[q++];
                if (!len || q + len > next) return { state: "invalid" };
                protocols.push(hello.subarray(q, q + len).toString("ascii"));
                q += len;
              }
            }
            p = next;
          }
          if (
            !servername ||
            protocols.some((x) => !["h2", "http/1.1"].includes(x))
          )
            return { state: "invalid" };
          return { state: "complete", servername, protocols };
        } catch {
          return { state: "invalid" };
        }
      }
    }
    offset += 5 + size;
  }
  return { state: "pending" };
}
