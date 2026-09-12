/**
 * @file services/ai-control-plane/src/readControlPlaneJSON.service.ts
 * @version 1.1.0
 * @date 2026-09-10
 * @description Ограничивает JSON control plane с учётом UTF-8 текста и ссылок на контекст.
 */
import type { IncomingMessage } from "node:http";

export const readControlPlaneJSON = async (
  request: IncomingMessage,
  maximumBytes = 48 * 1024,
): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const data = Buffer.from(chunk);
    size += data.length;
    if (size > maximumBytes) throw new Error("Request body is too large.");
    chunks.push(data);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Request body must be an object.");
  return value as Record<string, unknown>;
};
