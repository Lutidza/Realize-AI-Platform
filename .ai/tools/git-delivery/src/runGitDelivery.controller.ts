/**
 * @file .ai/tools/git-delivery/src/runGitDelivery.controller.ts
 * @version 1.0.1
 * @date 2026-09-09
 * @description Принимает команду CLI и передаёт её обработчику с назначенным механизмом запуска контекстом.
 */
import { emptyResult, PolicyError } from "./contracts.ts";
import { runDelivery } from "./handler.ts";
import { loadGitContext } from "./loadGitContext.adapter.ts";

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
    "REALIZE_GIT_CONTEXT_FILE=/absolute/context.json node src/runGitDelivery.controller.ts < command.json\nКонтекст назначает доверенный launcher; команда содержит action и необязательный message.\n",
  );
} else {
  let result = emptyResult();
  try {
    if (process.argv.length !== 2)
      throw new PolicyError(
        "invalid_arguments",
        "CLI не принимает Git-флаги или пути через аргументы.",
      );
    const context = await loadGitContext(process.env.REALIZE_GIT_CONTEXT_FILE);
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
