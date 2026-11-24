# Скилы Codex

`.codex/skills/` хранит исполняемые скилы Codex для проекта `Realize — AI Platform`.

## Границы

- Активные правила живут в `.ai/rules/*`.
- Проверки живут в `.ai/checks/*`.
- Скил описывает процедуру Codex, но не вводит новое project rule.
- Секреты, токены и runtime state не хранятся в skills.

## Контекст при подключении skill

Skill дополняет задачу по [протоколу проекта](../../AGENTS.md), а не заменяет
вход. При первом знакомстве полностью прочитай `README.md` и `.ai/README.md`,
для проектной работы — global registry и применимые тексты rules/checks.
Выбери нужные разделы длинных workflow и спецификаций по задаче; ссылка не
делает обязательным весь граф. Путь, metadata и пересказ не заменяют текст.
Актуальные тексты из текущего или унаследованного контекста используй без
повторов; второй skill не перезапускает вход. Отдельный журнал чтения не нужен.

Для недостающих источников используй существующий
[readonly reader](../../.ai/tools/context-reading/README.md) из корня проекта:

```bash
node .ai/tools/context-reading/read-context.mjs '[{"path":"README.md","startLine":1,"endLine":null},{"path":".ai/README.md","startLine":1,"endLine":null}]'
```

Пример относится к первому знакомству; уже полученные тексты не запрашивай.
CLI принимает JSON-массив до 3 независимых источников или непересекающихся
диапазонов. Строки нумеруются с 1, `endLine` включён в диапазон, `null` означает
до EOF. Зависимые разделы выбирай после определения владельца и границ;
не заполняй пакет неприменимыми источниками.
Для точного Markdown-раздела используй selection `{path, section}`, для текста
перед заголовком — `{path, beforeHeading}`. Значение — полный заголовок с `#`;
это адресное извлечение без угадывания строк и лишнего поиска известного заголовка.

Один вызов возвращает JSON `sources` (до 3 фрагментов с `path`, `startLine`,
`endLine`, `text`) и `pending` (ещё не выданные диапазоны без текста).
Источником текста служит только `sources`. Передавай весь `pending` следующим
вызовом как входной массив, сохраняя уже полученные диапазоны, пока остаток
не станет пустым. До этого выбранный обязательный текст не считается прочитанным.

Общий вывод вместе с JSON, `pending` и завершающим переводом строки ограничен
12 KiB (12 288 байт UTF-8); reader проверяет размер до вывода и сохраняет остаток.
Вызывай reader отдельной командой без дополнительного stdout после JSON:
проверки и прочие служебные команды можно группировать отдельно.
Для ответа чтения назначь `max_output_tokens: 8000`. При более строгом лимите
выбирай меньшие диапазоны и `--max-bytes N`: положительное N не больше 12288,
по умолчанию 12288. Байты не равны токенам. При внешнем усечении восстанови
только недоставленные диапазоны; не перечитывай весь пакет и не считай частичный
JSON полным ответом. Ошибка reader не подтверждает получение источника.

Не генерируй inline reader, heredoc или новый helper ради чтения; используй
общий инструмент. Не заменяй его `head` или обрезкой готового вывода.
Переполнение не отменяет обязательные источники и не разрешает завершение
с неполученным остатком. Перед профильным shell-анализом нужны тексты
`RULE-GLOBAL-PROJECT-GUARDRAILS`, `RULE-SAFE-COMMAND-PROPOSAL` и его check
по триггерам global registry. До поиска, включая поиск заголовков для навигации,
нужны полные `RULE-SEARCH-SCOPE-DISCIPLINE` и его check по входному протоколу.
Пустой `pending` не доказывает чтение обязательного источника, если его не выбрали.

Минимальные prompts ограниченных Git-воркеров сохраняются: они получают только
инструкции выбранного действия по Git-правилу. Это исключение не меняет
входной протокол основного агента.

## Текущие скилы

- `next-react-frontend-architecture` - Next.js/React/Tailwind UI boundaries.
- `payload-next-contracts-first` - Payload/Next API and data contract work.
- `codex-external-worker-session` - external Codex worker session lifecycle.
- `code-comment-discipline` - TSDoc/comment discipline.
- `dto-contracts-first` — публичные DTO и мапперы у фактического владельца.
- `feature-decomposition-guard` — структура кода и разделение ответственности.
- `frontend-guardrail-audit` - read-only audit of frontend guardrails.
- `frontend-runtime-evidence` - choose static/build/browser evidence tier.
- `git-commit-push` — программный inspect без модели; manage, commit/fetch/pull/push и GitHub merge проверенного дерева через отдельного модельного воркера.
- `reference-to-implementation` - reference/screenshot/current-page parity.
- `design-workshop` — этапы Мастерской, референсы, компоненты, темы и передача результата.
- `skill-documentation-sync` - sync `.ai`, `.codex` and docs artifacts.

Stale skills from transferred layers must be renamed, rewritten or removed
instead of kept as active aliases.

## Обновление

При добавлении или изменении skill обнови этот README и связанные
`.ai/registry/*`, role cards or workflows.
