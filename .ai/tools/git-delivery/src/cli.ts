/** CLI принимает только команду; защищённый файл контекста назначает механизм запуска. */
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { emptyResult, PolicyError } from "./contracts.ts";
import { runDelivery } from "./handler.ts";

async function contextFile(): Promise<unknown> {
  const path = process.env.REALIZE_GIT_CONTEXT_FILE;
  if (!path || !isAbsolute(path))
    throw new PolicyError(
      "context_required",
      "Механизм запуска должен назначить абсолютный REALIZE_GIT_CONTEXT_FILE.",
    );
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.size > 1024 * 1024 ||
      stat.uid !== process.getuid?.() ||
      stat.mode & 0o077
    ) {
      throw new PolicyError(
        "context_unsafe",
        "Контекст должен быть личным файлом текущего пользователя размером до 1 MiB.",
      );
    }
    const bytes = Buffer.alloc(1024 * 1024 + 1);
    let size = 0;
    while (size < bytes.length) {
      const read = await file.read(bytes, size, bytes.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > 1024 * 1024)
      throw new PolicyError(
        "context_unsafe",
        "Контекст превышает допустимый размер.",
      );
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)),
    );
  } finally {
    await file.close();
  }
}

async function commandInput(): Promise<unknown> {
  const timer = setTimeout(
    () =>
      process.stdin.destroy(
        new PolicyError("input_timeout", "Истекло время чтения команды."),
      ),
    5000,
  );
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 64 * 1024)
        throw new PolicyError("input_limit", "Команда превышает 64 KiB.");
      chunks.push(chunk);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } finally {
    clearTimeout(timer);
  }
}

if (process.argv.length === 3 && process.argv[2] === "--help") {
  process.stdout.write(
    "REALIZE_GIT_CONTEXT_FILE=/absolute/context.json node src/cli.ts < command.json\nКонтекст назначает доверенный launcher; команда содержит action и необязательный message.\n",
  );
} else {
  let result = emptyResult();
  try {
    if (process.argv.length !== 2)
      throw new PolicyError(
        "invalid_arguments",
        "CLI не принимает Git-флаги или пути через аргументы.",
      );
    const context = await contextFile();
    result = await runDelivery(await commandInput(), context);
  } catch (error) {
    result.errorCode =
      error instanceof PolicyError ? error.code : "invalid_input";
    result.summary =
      error instanceof PolicyError
        ? error.message
        : "Не удалось прочитать команду или доверенный контекст.";
  }
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode =
    result.status === "succeeded" || result.status === "noop"
      ? 0
      : result.status === "blocked"
        ? 2
        : 1;
}
