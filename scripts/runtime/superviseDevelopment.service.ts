/**
 * @file scripts/runtime/superviseDevelopment.service.ts
 * @version 1.0.1
 * @date 2026-09-15
 * @description Управляет запуском и согласованной остановкой сервисов разработки.
 * @see documentation/delivery/01-local-admin-ai.md
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import type {
  DevelopmentSupervisorOptions,
  SupervisedDevelopmentProcess,
} from "./DevelopmentRuntime.types";

/** Отказ порта проверяется до старта любого процесса; чужие сервисы не останавливаются. */
export const verifyDevelopmentPorts = async (
  ports: DevelopmentSupervisorOptions["runtime"]["ports"],
): Promise<void> => {
  for (const { name, host, port } of ports) {
    await new Promise<void>((accept, reject) => {
      const server = createServer();
      server.once("error", () =>
        reject(
          new Error(
            `Порт ${port} для ${name} недоступен. Проверьте уже запущенные процессы.`,
          ),
        ),
      );
      server.listen({ host, port, exclusive: true }, () =>
        server.close(() => accept()),
      );
    });
  }
};

/** Потеря сервиса прекращает новые задания; активный worker получает время на завершение. */
export const superviseDevelopment = async ({
  runtime,
  signal,
  log = console.log,
}: DevelopmentSupervisorOptions): Promise<number> => {
  await verifyDevelopmentPorts(runtime.ports);
  if (signal.aborted) return 0;
  const stopping = new AbortController();
  const owned: SupervisedDevelopmentProcess[] = [];
  const cleanup: Promise<void>[] = [];
  let exitCode = 0;
  const stop = () => {
    if (stopping.signal.aborted) return;
    stopping.abort();
    log("[dev] Останавливаю сервисы; исполнители завершат текущие задания.");
    for (const process of owned) process.stop();
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    for (const [index, specification] of runtime.processes.entries()) {
      if (stopping.signal.aborted) break;
      // Ждём только уже запущенные зависимости: Media не зависит от будущего control plane.
      if (specification.drain && specification.waitForReady !== false) {
        await Promise.all(
          runtime.processes
            .slice(0, index)
            .filter((item) => item.readyUrl)
            .map(async (item) => {
              const deadline = Date.now() + 180_000;
              while (!stopping.signal.aborted && Date.now() < deadline) {
                try {
                  const response = await fetch(item.readyUrl!, {
                    signal: AbortSignal.any([
                      stopping.signal,
                      AbortSignal.timeout(3_000),
                    ]),
                  });
                  await response.body?.cancel();
                  if (response.ok) return;
                } catch {
                  /* Процесс ещё стартует; ожидание ограничено общим сроком. */
                }
                await delay(250, undefined, { signal: stopping.signal }).catch(
                  () => undefined,
                );
              }
              if (!stopping.signal.aborted)
                throw new Error(
                  `Сервис ${item.name} не подтвердил запуск за 180 секунд.`,
                );
            }),
        );
      }
      if (stopping.signal.aborted) break;
      const child = spawn(process.execPath, specification.args, {
        cwd: runtime.cwd,
        env: runtime.environment,
        stdio: "inherit",
        detached: process.platform !== "win32",
      });
      let finished = false;
      let complete!: () => void;
      const done = new Promise<void>((resolve) => {
        complete = resolve;
      });
      const fail = () => {
        if (stopping.signal.aborted) return;
        exitCode = 1;
        log(
          `[dev] Сервис ${specification.name} завершился; проверьте его журнал выше.`,
        );
        stop();
      };
      owned.push({
        done,
        stop: () => {
          if (child.pid === undefined) return;
          const pid = child.pid;
          try {
            // Сигнал группе worker убил бы Codex/checks до записи результата задания.
            if (specification.drain || process.platform === "win32") {
              if (!finished) child.kill("SIGTERM");
            } else {
              // Родитель мог уже упасть, пока его дочерние процессы ещё держат группу.
              process.kill(-pid, "SIGTERM");
              cleanup.push(
                (async () => {
                  const deadline = Date.now() + 5_000;
                  while (Date.now() < deadline) {
                    try {
                      process.kill(-pid, 0);
                    } catch {
                      return;
                    }
                    await delay(50);
                  }
                  try {
                    process.kill(-pid, "SIGKILL");
                  } catch {
                    /* Группа уже завершилась. */
                  }
                })(),
              );
            }
          } catch {
            /* Процесс мог завершиться между событием и сигналом. */
          }
        },
      });
      child.once("error", () => {
        finished = true;
        complete();
        fail();
      });
      child.once("exit", (code) => {
        finished = true;
        complete();
        if (runtime.processes.length === 1 && code === 0) stop();
        else fail();
      });
      log(`[dev] Запущен ${specification.name}.`);
    }
    await Promise.all(owned.map((child) => child.done));
  } catch (error) {
    exitCode = 1;
    log(
      `[dev] ${error instanceof Error ? error.message : "Не удалось запустить сервисы."}`,
    );
    stop();
    await Promise.all(owned.map((child) => child.done));
  } finally {
    await Promise.all(cleanup);
    signal.removeEventListener("abort", stop);
  }
  return exitCode;
};
