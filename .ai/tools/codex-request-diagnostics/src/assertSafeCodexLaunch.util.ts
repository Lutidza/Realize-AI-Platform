/**
 * @file .ai/tools/codex-request-diagnostics/src/assertSafeCodexLaunch.util.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Отклоняет launch с неаудированными локальными hooks/notify вместо отключения обязательных gates.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const MAX_CONFIG_BYTES = 1024 * 1024;
const sinkDeclaration =
  /\b(?:notify|hooks|managed_hooks|hooks_file|hook_files)\b["']?\s*(?:=|\.)|^\s*\[\[?[^\]\n]*\b(?:hooks|managed_hooks)\b/m;

/** Принимается консервативное подмножество TOML: escaped keys/неизвестные policies требуют аудита. */
export function assertConfigTextHasNoRawSinks(text: string): void {
  if (/\\(?:u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8})/.test(text))
    throw new Error("exec_configuration_unverified");
  if (sinkDeclaration.test(text))
    throw new Error("exec_configured_hooks_present");
  if (
    /^\s*\[\[?[^\]\n]*\bshell_environment_policy\b|\bshell_environment_policy\b["']?\s*(?:=|\.)/m.test(
      text,
    )
  )
    throw new Error("exec_configuration_unverified");
  if (
    /\b(?:cloud_config|config_bundle|managed_config_bundle)\b["']?\s*=/m.test(
      text,
    )
  )
    throw new Error("exec_configuration_unverified");
}

function readConfig(path: string): string {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) throw new Error();
    return readFileSync(path, "utf8");
  } catch {
    throw new Error("exec_configuration_unverified");
  }
}

/**
 * Проверяет известные Linux config layers Codex 0.162.1. Не исполняет и не отключает hooks.
 * Неизвестные remote policy selectors и linked-worktree mapping требуют отдельного аудита.
 * Конфиги читаются только в RAM; их значения, paths и ошибки не выводятся.
 */
export function assertSafeCodexLaunch(cwd: string): void {
  if (process.platform !== "linux")
    throw new Error("exec_configuration_unverified");
  if (
    Object.keys(process.env).some(
      (name) =>
        /^CODEX_(?:CONFIG_BUNDLE|CLOUD_CONFIG|MANAGED_HOOK|REQUIREMENTS)/.test(
          name,
        ) && process.env[name],
    )
  )
    throw new Error("exec_configuration_unverified");
  const root = resolve(cwd);
  const git = join(root, ".git");
  if (!existsSync(git) || !lstatSync(git).isDirectory())
    throw new Error("exec_configuration_unverified");
  const home = resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));
  const folders = new Set([home, "/etc/codex"]);
  const files = new Set<string>([join(root, "config.toml")]);
  for (let at = root; ; at = dirname(at)) {
    folders.add(join(at, ".codex"));
    if (at === dirname(at)) break;
  }
  if (existsSync(home)) {
    const named = readdirSync(home).filter((name) =>
      name.endsWith(".config.toml"),
    );
    if (named.length > 32) throw new Error("exec_configuration_unverified");
    for (const name of named) files.add(join(home, name));
  }
  for (const folder of folders) {
    for (const name of [
      "config.toml",
      "managed_config.toml",
      "requirements.toml",
    ])
      files.add(join(folder, name));
    const hooks = join(folder, "hooks.json");
    if (existsSync(hooks)) {
      const text = readConfig(hooks).trim();
      // Неизвестное JSON/пустой shell callback не интерпретируются как безопасная конфигурация.
      if (
        text &&
        text !== "{}" &&
        !/^\{\s*"hooks"\s*:\s*\{\s*\}\s*\}$/.test(text)
      )
        throw new Error("exec_configured_hooks_present");
    }
  }
  for (const path of files) {
    if (!existsSync(path)) continue;
    const text = readConfig(path);
    // Runner добавляет proxy exclusions только к стандартной policy: чужой exclude-list не заменяется.
    assertConfigTextHasNoRawSinks(text);
  }
}
