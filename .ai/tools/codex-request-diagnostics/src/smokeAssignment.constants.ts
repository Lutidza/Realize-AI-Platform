/**
 * @file .ai/tools/codex-request-diagnostics/src/smokeAssignment.constants.ts
 * @version 1.0.0
 * @date 2026-11-20
 * @description Задаёт публичные ограниченные smoke-задания без captured runtime payload.
 */
/** Готовый первый пакет исключает самостоятельное угадывание JSON schema и содержит только обязательные sources. */
export const BOOTSTRAP_READ_SELECTIONS = [
  { path: "README.md", startLine: 1, endLine: null },
  { path: ".ai/README.md", startLine: 1, endLine: null },
  { path: ".ai/registry/rules/global/INDEX.md", startLine: 1, endLine: null },
] as const;
export const BOOTSTRAP_READ_COMMAND =
  "node .ai/tools/context-reading/read-context.mjs '" +
  JSON.stringify(BOOTSTRAP_READ_SELECTIONS) +
  "'";

/** Проспективный критерий текущего frozen smoke-profile; подтверждается реальным reader в local fixture. */
export const EXPECTED_READER_CALLS = 6;

/** Один inspect с явной компактной проекцией; pipefail сохраняет exit производителя. */
export const INSPECT_COMMAND =
  "set -o pipefail && npm run --silent git:worker -- inspect | node --import=tsx/esm .ai/tools/git-delivery/src/worker/renderGitInspectSummary.controller.ts";

/** Проверка runtime и первый inspect разделяют один command call; оба guard сохраняют отказ. */
export const FIRST_INSPECT_COMMAND =
  "npm run verify:runtime && " + INSPECT_COMMAND;

export const FULL_ASSIGNMENT =
  "Примени $git-commit-push и роль Scope/Contour Owner из .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md. Нужен только read-only inspect текущего checkout через штатный программный adapter npm run --silent git:worker -- inspect. Это не запрос commit/push/delivery и не запрос содержимого всех diff. Другие Git-действия и raw Git CLI запрещены. Если штатный inspect недоступен в read-only окружении, сообщи точный blocker и не пытайся его чинить или обходить. Не запускай модельного Git-воркера. Закреплённый runtime проверь штатной verify:runtime в первом inspect по команде ниже. Тесты/build запрещены.\nЭто настоящий read-only smoke-test выбора контекста. Нельзя изменять файлы проекта, инструкции, настройки, создавать TASK, отчёты или logs; не запускай других агентов и не меняй модель/reasoning. Не используй browser, DB, внешнюю сеть или MCP (в диагностике они отключены). Читай источники shell-командами; runtime state и чужие журналы не открывай. Применимые инструкции бери из соответствующих skills/ролей, не выдумывай их. Не создавай proposal или новый досье. Верни краткий результат по-русски, реально прочитанные источники/разделы и ограничения. Не выдавай план или пропуск за выполненное действие.\nДля сопоставимости этого smoke-test набор обязательных текстов одинаков в обоих вариантах: README.md и .ai/README.md полностью; .ai/registry/rules/global/INDEX.md; .ai/rules/global/RULE-GLOBAL-PROJECT-GUARDRAILS.md; .ai/rules/global/RULE-SAFE-COMMAND-PROPOSAL.md; .ai/checks/pre-implementation/CHECK-SAFE-COMMAND-PROPOSAL.md; указанная карточка Scope Owner; Git workflow «Программный inspect» и Git-правило «Исполнитель и разрешение»; раздел «Единый runtime проекта» .ai/rules/development/RULE-DEPENDENCY-VERSION-EVIDENCE-BEFORE-INSTALL.md и «Ожидание процессов и воркеров» .ai/rules/worker-runtime/RULE-WORKER-CONTEXT-BUDGET-AND-REUSE.md. Если их актуального полного текста нет в контексте, дочитай. Это список источников, а не предоставленный текст. Сводка статуса и числа показанных изменений достаточна; сами пути и diff не нужны." +
  "\nПервое чтение обязательных sources выполни ровно этой командой; для её ответа укажи max_output_tokens: 8000:\n" +
  BOOTSTRAP_READ_COMMAND +
  "\nОчередь — в порядке списка выше; bootstrap уже выбрал первые три sources. Каждый раз: весь pending + следующие ещё не выбранные sources до трёх selections. Source выбирается один раз, остатки — только pending; не оставляй свободный слот при наличии следующего source. Новые selections: EOF/точный section; числовые диапазоны — только pending. Всегда reader budget 12288 bytes/max_output_tokens 8000, ровно шесть вызовов, без повторов/усечения/пропусков. Тексты документов в prompt не предоставлены." +
  "\nПервый inspect в каждой CLI-сессии выполни ровно этой командой: verify:runtime выполняется один раз в том же command call, отдельный вызов verify:runtime запрещён. При отказе verify:runtime не запускай inspect и сообщи blocker:\n" +
  FIRST_INSPECT_COMMAND +
  "\nКаждый последующий inspect, если он разрешён финальным объёмом задания, выполни отдельным command call ровно этой командой без повторной проверки runtime:\n" +
  INSPECT_COMMAND +
  "\nКомпактный JSON envelope каждого inspect целиком передай модели через tool output, без ручного пересказа/выборки полей. Количество разрешённых inspect задано в конце задания.";
