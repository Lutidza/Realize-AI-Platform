/**
 * @file scripts/runtime/readLocalMcpHeaders.service.mjs
 * @version 1.0.0
 * @date 2026-09-24
 * @description Читает локальный MCP credential из окружения или private файла установки без загрузки окружения приложения.
 * @see documentation/architecture/mcp-tooling.md
 */
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

/**
 * Возвращает заголовки только локальному HTTP-клиенту; вызывающий код не должен журналировать результат.
 * @param {{environment?: Record<string, string | undefined>, credentialFile?: string}} options Доверенные параметры клиента, не MCP tool input.
 * @returns {Promise<{Authorization: string}>}
 */
export async function readLocalMcpHeaders(options = {}) {
  const environment = options.environment ?? process.env;
  let token = environment.REALIZE_MCP_CLIENT_TOKEN;
  if (token === undefined) {
    const filename =
      options.credentialFile ??
      join(homedir(), ".local/share/realize-ai-cms/internal-mcp.env");
    const file = await open(
      filename,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await file.stat({ bigint: true });
      if (
        !before.isFile() ||
        before.nlink !== 1n ||
        before.size > 8192n ||
        (Number(before.mode) & 0o077) !== 0 ||
        (process.getuid && Number(before.uid) !== process.getuid())
      )
        throw new Error("MCP_CREDENTIAL_FILE_NOT_PRIVATE");
      const bytes = Buffer.alloc(Number(before.size) + 1);
      let length = 0;
      while (length < bytes.length) {
        const read = await file.read(
          bytes,
          length,
          bytes.length - length,
          length,
        );
        if (!read.bytesRead) break;
        length += read.bytesRead;
      }
      const after = await file.stat({ bigint: true });
      if (
        BigInt(length) !== before.size ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs
      )
        throw new Error("MCP_CREDENTIAL_FILE_CHANGED");
      token = parseEnv(
        bytes.subarray(0, length).toString("utf8"),
      ).REALIZE_MCP_CLIENT_TOKEN;
    } finally {
      await file.close();
    }
  }
  if (!token || !/^[A-Za-z0-9_-]{43,128}$/u.test(token))
    throw new Error("MCP_CREDENTIAL_UNAVAILABLE");
  return { Authorization: `Bearer ${token}` };
}
