/**
 * @file src/components/admin/extensions/useExtensionCommand.hook.ts
 * @version 1.1.0
 * @date 2026-10-12
 * @description Подключает appearance команды к общей frozen mutation и lock экрана расширений.
 */
"use client";
import type {
  ExtensionCommandInput,
  ExtensionCommandResult,
  ExtensionManagerTransport,
} from "./ExtensionManager.types";
import type { ExtensionMutationLock } from "./ExtensionMutation.types";
import { useExtensionMutation } from "./useExtensionMutation.hook";

export function useExtensionCommand(
  transport: ExtensionManagerTransport,
  lock?: ExtensionMutationLock,
) {
  return useExtensionMutation<ExtensionCommandInput, ExtensionCommandResult>(
    async (command, requestId) =>
      command.kind === "prepare"
        ? {
            kind: "prepare",
            data: await transport.prepare(command.input, requestId),
          }
        : {
            kind: "apply",
            data: await transport.apply(command.input, requestId),
          },
    lock,
  );
}
