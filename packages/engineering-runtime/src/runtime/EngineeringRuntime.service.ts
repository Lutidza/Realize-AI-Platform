/**
 * @file packages/engineering-runtime/src/runtime/EngineeringRuntime.service.ts
 * @version 1.1.0
 * @date 2026-10-26
 * @description Предоставляет общий server API инженерных операций независимо от CLI, Admin и MCP.
 * @see documentation/architecture/engineering-operations.md
 */
import { engineeringCommandSchemas } from "../contracts/engineeringCommands.schemas.ts";
import type {
  EngineeringCommandByName,
  EngineeringCommandName,
} from "../contracts/EngineeringCommand.types.ts";
import type { EngineeringRuntimeOptions } from "./EngineeringRuntime.types.ts";
import { EngineeringContext } from "./EngineeringContext.service.ts";
import { EngineeringFailure, failure } from "./EngineeringFailure.error.ts";
import { planOperation } from "./EngineeringPlanning.service.ts";
import { applyOperation } from "./EngineeringExecution.service.ts";
import {
  cancelOperation,
  inspectLockedRecovery,
  recoverOperation,
} from "./EngineeringRecovery.service.ts";
import { mapOperation } from "./EngineeringOperation.mapper.ts";
import { previewOperation, readEvents } from "./EngineeringRead.service.ts";
import { hashEngineeringValue } from "../contracts/hashEngineeringValue.util.ts";
import { hashContentCommand } from "../content/hashContentCommand.util.ts";
import { mapPreparedContent } from "../content/mapPreparedContent.mapper.ts";

/** Construction принимает только доверенные host ports; ни путь, ни actor не берутся из команды. */
export class EngineeringRuntime {
  private readonly ctx: EngineeringContext;
  constructor(options: EngineeringRuntimeOptions) {
    this.ctx = new EngineeringContext(options);
  }

  private async command<Name extends EngineeringCommandName, Result>(
    name: Name,
    input: unknown,
    action: (command: EngineeringCommandByName[Name]) => Promise<Result>,
  ): Promise<Result> {
    try {
      const parsed = engineeringCommandSchemas[name].safeParse(input);
      if (!parsed.success)
        return failure(
          "INVALID_INPUT",
          "Некорректная команда инженерного протокола.",
        );
      await this.ctx.authorize(name);
      return await action(parsed.data as EngineeringCommandByName[Name]);
    } catch (error) {
      if (error instanceof EngineeringFailure) throw error;
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : null;
      if (
        code === "CONFLICT" ||
        code === "LIMIT_EXCEEDED" ||
        code === "UNSUPPORTED"
      )
        return failure(code, "Journal или workspace не допускает операцию.");
      return failure(
        "INTERNAL_ERROR",
        "Не удалось выполнить инженерную команду.",
      );
    }
  }
  /** Frozen plan или состояние подготовки; повтор request не планирует заново. */
  plan(input: unknown) {
    return this.command("plan", input, (command) =>
      planOperation(this.ctx, command),
    );
  }
  preview(input: unknown) {
    return this.command("preview", input, (command) =>
      previewOperation(this.ctx, command),
    );
  }
  apply(input: unknown) {
    return this.command("apply", input, (command) =>
      applyOperation(this.ctx, command),
    );
  }
  cancel(input: unknown) {
    return this.command("cancel", input, (command) =>
      cancelOperation(this.ctx, command),
    );
  }
  recover(input: unknown) {
    return this.command("recover", input, (command) =>
      recoverOperation(this.ctx, command),
    );
  }
  events(input: unknown) {
    return this.command("events", input, (command) =>
      readEvents(this.ctx, command),
    );
  }
  get(input: unknown) {
    return this.command("get", input, async (command) => {
      const record = this.ctx.load(command.operationId);
      await this.ctx.authorize("get", record);
      return mapOperation(record);
    });
  }
  /** Выдаёт последний immutable receipt; отсутствие receipt не становится success. */
  receipt(input: unknown) {
    return this.command("get", input, async (command) => {
      const record = this.ctx.load(command.operationId);
      await this.ctx.authorize("get", record);
      return structuredClone(record.payload.receipts.at(-1) ?? null);
    });
  }
  inspectRecovery(input: unknown) {
    return this.command("inspectRecovery", input, async (command) => {
      const record = this.ctx.load(command.operationId);
      await this.ctx.authorize("inspectRecovery", record);
      return this.ctx.store.withWorkspaceLease(async (lease) => {
        const fresh = this.ctx.load(command.operationId);
        await this.ctx.authorize("inspectRecovery", fresh);
        lease.assertHeld();
        return inspectLockedRecovery(this.ctx, fresh);
      });
    });
  }
  prepareContent(input: unknown) {
    return this.command("prepareContent", input, async (command) => {
      this.ctx.target(command.targetId);
      const content = this.ctx.options.content;
      if (!content)
        return failure(
          "UNSUPPORTED",
          "Immutable content storage ещё не подключён.",
        );
      return this.ctx.store.withWorkspaceLease(async (lease) => {
        await this.ctx.authorize("prepareContent");
        lease.assertHeld();
        // ctx.request сохраняет общий key namespace; blob body имеет отдельный bounded hash budget.
        const { key } = this.ctx.request("prepareContent", {
          requestId: command.requestId,
        });
        const result: unknown = content.prepare(structuredClone(command), {
          key,
          hash: hashContentCommand(command),
          principalHash: hashEngineeringValue(this.ctx.options.principal),
        });
        if (result instanceof Promise) {
          void result.catch(() => undefined);
          return failure(
            "UNSUPPORTED",
            "Content port должен завершаться синхронно.",
          );
        }
        lease.assertHeld();
        return mapPreparedContent(result);
      });
    });
  }
}
