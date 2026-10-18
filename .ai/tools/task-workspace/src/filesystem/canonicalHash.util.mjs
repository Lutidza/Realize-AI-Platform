/**
 * @file .ai/tools/task-workspace/src/filesystem/canonicalHash.util.mjs
 * @version 1.0.0
 * @date 2026-10-15
 * @description Вычисляет SHA-256 байтов и согласованного JSON-представления значений.
 * @see documentation/specifications/task-management-execution.md
 */
import { createHash } from "node:crypto";

/**
 * @param {string | NodeJS.ArrayBufferView} bytes
 * @returns {string}
 */
export const hashBytes = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

/**
 * Хеширует JSON в порядке свойств, заданном вызывающей стороной, без их сортировки.
 * @param {unknown} value
 * @returns {string}
 */
export const canonicalHash = (value) =>
  hashBytes(Buffer.from(JSON.stringify(value)));
