# Workflow MCP/tooling contour (`mcp_tooling_workflow`)

```yaml
artifact_id: mcp-tooling-workflow
artifact_type: ai-workflow
owner_layer: .ai/workflows/ai-operations/mcp-tooling/
runtime_sources:
  - .ai/roles/process-tools-operations/mcp-tooling-steward/INDEX.md
  - .ai/rules/external-tools/RULE-MCP-TOOLING-CONTOUR.md
  - .ai/checks/pre-implementation/CHECK-MCP-TOOLING-CONTOUR.md
  - documentation/architecture/mcp-tooling.md
related_codex_artifacts:
  - .codex/config.toml
  - .codex/README.md
  - .codex/STRUCTURE.md
```

## Назначение

Workflow задаёт рабочий порядок для MCP и внешних tools. Он не добавляет
конкретные MCP servers сам по себе и не делает session-provided tools
проектным контрактом.

## Точки входа

- Пользователь просит использовать конкретный MCP, plugin или connector.
- Rule/check/workflow требует tool-dependent evidence.
- Worker profile, audit или review ссылается на MCP/tool.
- Нужно добавить, удалить или изменить project-specific MCP config.
- Tool недоступен, и нужно выбрать fallback или blocker.
- Найден drift между `.ai` MCP policy и `.codex` adapter layer.

## Источники tools

- `project_specific`: явно настроено в `.codex/config.toml`.
- `session_provided`: доступно текущей средой выполнения, но не хранится как
  project contract.
- `plugin_provided`: поставляется установленным plugin.
- `connector`: подключается через connector/app runtime.
- `local_tool`: доступно как CLI, script, browser, database или test tool.
- `fallback`: замена, достаточная для задачи при documented skip/fallback
  reason.

## Порядок

```text
tool_need
-> classify_source_type
-> locate_source_of_truth
-> availability_check
-> select_tool_or_fallback
-> execute_or_block
-> record_evidence
-> sync_ai_codex_docs_if_changed
```

## Availability check

Перед использованием MCP/tool агент фиксирует:

- какой tool нужен и для чего;
- source type;
- где находится source of truth;
- доступен ли tool в текущей среде;
- какой fallback допустим;
- является ли отсутствие tool blocker-ом.

## S1: bootstrap и контекст проекта

`realize-internal` — project-specific loopback MCP из `.codex/config.toml`.
Текущая локальная установка использует отдельный developer bootstrap service;
это не managed instance из Admin. Запуск, credential helper и ограничения — в
[MCP tooling](../../../../documentation/architecture/mcp-tooling.md).

1. Проверь наличие инструментов в текущем клиенте. Новая запись config не
   добавляет их в уже открытую сессию автоматически.
   Если клиент выдаёт MCP через deferred tool search и Code Mode, сначала
   раскрой нужные определения и используй штатную обёртку вызова. Отсутствие
   в начальном списке не доказывает недоступность сервера. В read-only проверке
   различай такую оркестрацию MCP и команды терминала; разрешай discovery
   только для нужных инструментов, сохраняя область задания.
2. Вызови `ai_capabilities_list`: учитывай grants, зависимости, `unavailable`
   и `not_probed`; каталог не выдаёт разрешений на будущие вызовы.
3. Передай `ai_context_resolve` краткую задачу, kind и относительные target
   paths. Они уточняют выбор источников, но не удаляют обязательное ядро.
4. Прочитай применимые источники через `ai_instructions_get` с их
   `expectedSha256`. Для длинного источника выбери нужный раздел и передавай
   `startLine`/`lineCount` для его диапазона; `nextLine` продолжает чтение до
   конца необходимого текста, а не обязательно всего документа. При усечении
   дочитай недостающее. Уже доставленные актуальные диапазоны не загружай
   повторно ради подключения ещё одной роли или skill.
   При изменении hash обнови контекст. Проверь issues, coverage и отложенные
   ссылки; расширь чтение по фактическому владельцу, если обход ограничен.
5. Разреши применимость и prose-конфликты по иерархии инструкций среды и
   исходным документам. Resolver извлекает ссылки, не интерпретирует все правила.
6. При отказе MCP прочитай те же источники напрямую и запиши fallback.
   Git inspection/delivery остаётся на действующем Git workflow.

## Project-specific MCP config

Project-specific MCP config живёт в `.codex/config.toml`. Изменять его можно
только после:

- owner-layer decision;
- проверки dependency/version evidence, если добавляется новый server/package;
- secret handling decision;
- синхронизации `.ai/rules`, `.ai/checks`, registry, workflow и
  `documentation/architecture/mcp-tooling.md`.

## MCP self-scan

`MCP self-scan` - это обязательная discoverability/drift проверка при
добавлении или изменении MCP/tooling contour. Минимальный scan:

- найти MCP references в `.ai`, `.codex` и `documentation`;
- проверить, что MCP references маршрутизируются к role, workflow, rule,
  check, registry и `.codex/config.toml`;
- проверить отсутствие transferred project-specific MCP entries, старых
  project names, stale paths, secrets или tokenized config;
- подтвердить, что `.codex/config.toml` либо содержит согласованные
  project-specific MCP entries, либо явно фиксирует их отсутствие.

Результат scan фиксируется как `mcp_reference_scan` и
`stale_mcp_assumption_scan`.

## Fallback policy

Fallback допустим, если:

- задача не требует именно project-specific MCP;
- replacement evidence покрывает требуемую проверку;
- skip/fallback reason явно записан в результате.

Fallback запрещён, если:

- tool является source of truth для задачи;
- без него результат будет предположением;
- missing tool скрывает реальный blocker.

## Handoff

Результат workflow должен содержать:

- selected MCP/tool или blocker;
- source type;
- availability status;
- mcp reference/stale assumption scan, если меняется MCP contour;
- evidence или fallback reason;
- affected `.ai`/`.codex` sync decision;
- residual risks.
