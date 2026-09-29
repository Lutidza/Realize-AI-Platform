/**
 * @file .ai/tools/agent-search/src/buildRipgrepArgs.util.mjs
 * @version 1.0.1
 * @date 2026-09-26
 * @description Формирует аргументы ripgrep без shell и с приоритетом исключений профиля.
 */
export function buildRipgrepArgs(options, scope) {
  const args = [
    "--no-config",
    "--color=never",
    "--hidden",
    "--no-follow",
    "--no-require-git",
    "--no-ignore-global",
    "--no-ignore-parent",
  ];
  if (options.output === "paths") args.push("--files", "--null");
  else {
    args.push(options.output === "files" ? "--files-with-matches" : "--json");
    if (options.output === "files") args.push("--null");
    if (options.fixed) args.push("--fixed-strings");
    if (options.ignoreCase) args.push("--ignore-case");
    args.push("--regexp", options.query);
  }
  // Пользовательские glob исполняются только общим matcher до чтения содержимого.
  for (const extension of options.extensions)
    args.push("--type-add", `agentsearch:*.${extension}`);
  if (options.extensions.length) args.push("--type", "agentsearch");
  if (options.profile.explicit) args.push("--no-ignore");
  // Запреты идут последними: пользовательский glob не возвращает generated/secrets.
  for (const glob of scope.excluded) args.push("--glob", `!${glob}`);
  args.push("--", ...scope.paths);
  return args;
}
