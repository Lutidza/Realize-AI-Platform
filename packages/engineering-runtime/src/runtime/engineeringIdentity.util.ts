/**
 * @file packages/engineering-runtime/src/runtime/engineeringIdentity.util.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Выводит стабильный UUID v8 из SHA-256 значимых полей объекта.
 * @see documentation/architecture/engineering-operations.md
 */
export function engineeringIdentity(hash: string): string {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
