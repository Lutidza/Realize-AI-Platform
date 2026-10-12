/**
 * @file .ai/tools/git-delivery/src/worker/loadGitWorkerSettings.adapter.ts
 * @version 1.3.0
 * @date 2026-10-12
 * @description Читает конфигурацию Codex и действующие инструкции Git-воркера из проекта.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PolicyError } from "../contracts.ts";
import type { GitWorkerAction, GitWorkerSettings } from "./GitWorker.types.ts";
import { isGitWorkerAction } from "./parseGitWorkerCommand.validator.ts";

export async function loadGitWorkerSettings(
  repositoryRoot: string,
  action: GitWorkerAction,
): Promise<GitWorkerSettings> {
  if (!isGitWorkerAction(action)) {
    throw new PolicyError(
      "worker_action_unavailable",
      "Действие воркера недоступно.",
    );
  }
  const config: unknown = JSON.parse(
    await readFile(
      join(repositoryRoot, `.codex/agents/delivery/git/${action}.json`),
      "utf8",
    ),
  );
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new PolicyError(
      "worker_configuration_invalid",
      "Неверная конфигурация Git-воркера.",
    );
  }
  const fields = config as Record<string, unknown>;
  if (
    Object.keys(fields).some(
      (key) => !["model", "reasoningEffort", "timeoutMs"].includes(key),
    ) ||
    typeof fields.model !== "string" ||
    !/^[a-z0-9][a-z0-9.-]{1,95}$/.test(fields.model) ||
    typeof fields.reasoningEffort !== "string" ||
    !["low", "medium", "high"].includes(fields.reasoningEffort) ||
    !Number.isSafeInteger(fields.timeoutMs) ||
    Number(fields.timeoutMs) < 1000 ||
    Number(fields.timeoutMs) > 120000
  ) {
    throw new PolicyError(
      "worker_configuration_invalid",
      "Неверная конфигурация Git-воркера.",
    );
  }
  const instructions = await readFile(
    join(repositoryRoot, `.codex/prompts/workflows/delivery/git/${action}.md`),
    "utf8",
  );
  if (!instructions.trim() || Buffer.byteLength(instructions) > 32768) {
    throw new PolicyError(
      "worker_instructions_invalid",
      "Инструкции пусты или превышают предел чтения.",
    );
  }
  return {
    model: fields.model,
    reasoningEffort:
      fields.reasoningEffort as GitWorkerSettings["reasoningEffort"],
    timeoutMs: fields.timeoutMs as number,
    instructions,
  };
}
