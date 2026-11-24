# Структура операционного слоя ИИ-агентов

```yaml
artifact_id: ai-operating-layer-structure
artifact_type: ai-runtime-structure
owner_layer: .ai/
runtime_sources:
  - .ai/README.md
  - .ai/system/INDEX.md
  - documentation/project-context.md
```

Карта показывает существующие каталоги `.ai/` и основные входные документы.
Протокол работы находится в [AGENTS.md](../AGENTS.md), назначение разделов —
в [README.md](README.md).

## Карта каталогов

```text
.ai/
├── README.md
├── STRUCTURE.md
├── system/
│   ├── INDEX.md
│   └── state-machine.md
├── roles/
│   ├── role-groups.md
│   ├── design/workshop-director/INDEX.md
│   ├── developer/
│   │   ├── frontend/INDEX.md
│   │   └── backend/INDEX.md
│   └── process-tools-operations/
├── rules/
├── checks/
├── registry/
│   └── rules/INDEX.md
├── workflows/
│   ├── INDEX.md
│   ├── core/
│   │   ├── main-delivery/WORKFLOW.md
│   │   ├── worker-assignment/WORKFLOW.md
│   │   └── worker-session/WORKFLOW.md
│   ├── ai-operations/
│   │   ├── agent-monitor-service-lifecycle/WORKFLOW.md
│   │   ├── agent-runtime-maintenance/WORKFLOW.md
│   │   ├── agents-evolution/WORKFLOW.md
│   │   └── mcp-tooling/WORKFLOW.md
│   ├── quality/
│   │   ├── INDEX.md
│   │   └── performance-measurement/{INDEX.md,WORKFLOW.md}
│   ├── delivery/
│   │   └── git/commit-push/WORKFLOW.md
│   └── frontend/
│       ├── next-react/guardrail/WORKFLOW.md
│       └── design-workshop/WORKFLOW.md
├── templates/
│   ├── performance/{INDEX.md,TEMPLATE-PERFORMANCE-MEASUREMENT.md}
│   └── task-workspace/TEMPLATE-TASK.md
├── tools/
│   ├── agent-runtime/
│   │   ├── README.md
│   │   └── runtime/INDEX.md
│   ├── agent-monitor/README.md
│   ├── agent-search/README.md
│   ├── engineering/README.md
│   ├── git-delivery/README.md
│   ├── quality/README.md
│   ├── task-workspace/README.md
│   └── source-headers/README.md
├── worker-profiles/
│   └── INDEX.md
├── agents-evolution/
│   ├── INDEX.md
│   ├── observations/
│   ├── improvement-proposals/
│   └── applied-changes/
└── research/
```

## Назначение материалов

- `rules/`, `checks/`, `roles/` и `workflows/` содержат действующие инструкции;
  связи и условия применения правил находятся в [реестре](registry/rules/INDEX.md).
- `rules/runtime/` и `checks/runtime/` задают применимый набор для AI runtime
  продукта. Его явный publisher выпускает artifact; runtime не читает инструкции
  из клиентского checkout. Вход — [реестр runtime](registry/rules/runtime/INDEX.md).
- `tools/` содержит исходники и документацию локальных инструментов агентов.
- [tools/context-reading/](tools/context-reading/README.md) читает выбранные
  диапазоны документов ограниченными пакетами без записи файлов.
- [tools/codex-request-diagnostics/](tools/codex-request-diagnostics/README.md)
  наблюдает фактические запросы native Codex через временный TLS relay,
  сохраняя только HMAC, counts и usage без payload или reasoning.
- `tools/quality/` проверяет metadata и связи активного слоя для CI;
  поведенческие evals используют продуктовый adapter через `scripts/runtime/evaluation/`.
- `tools/engineering/` содержит project binding для `source.util` и
  `ai.template`, trusted folder policies, native metadata validators и чистые
  renderers. Публичный вход — `src/projectEngineering.index.ts`; filesystem,
  journal и recovery принадлежат `packages/engineering-runtime`. Это программный
  create/edit adapter ENG-08/09; CLI/MCP/Admin write capabilities ещё не подключены.
- `tools/git-delivery/src/worker/` запускает Git-воркера для inspect, commit, push,
  manage, fetch, pull и GitHub merge проверенного дерева; настройки
  находятся в `.codex/`, общий транспорт — в `packages/codex-adapter/`.
  Общий Git process/lock owner для IDE, платформы и GPT/MCP находится в
  `packages/git-runtime/`; этот пакет не является источником инструкций модели.
  `tools/git-delivery/src/verification/` содержит CLI-адаптер явно выбранных checks;
  общий runner, ключи и receipts для IDE и execution/preview принадлежат
  `packages/verification-runtime/`. Git proofs остаются в `worker/verification/`.
  API описан в README инструмента и общего пакета.
- `worker-profiles/` предназначен для необязательных повторно используемых
  профилей делегирования. Сейчас содержит только индекс, готовых профилей нет.
- `agents-evolution/` хранит наблюдения, предложения и результаты изменения
  слоя. Исторические записи не переопределяют действующие инструкции.
- `research/` содержит справочные исследования внешних образцов. Они не
  подтверждают наличие соответствующих возможностей в проекте и читаются
  только по относящейся к ним задаче.

Действующий раздел инструкций должен иметь `INDEX.md`, `WORKFLOW.md`,
`RULE-*.md`, `CHECK-*.md`, `PROFILE.md` или другой согласованный входной документ.
Наличие каталога само по себе не делает его источником правил. Пустые ветки
для будущей реализации заранее не создаются.

Целевой [контракт инженерных артефактов](../documentation/architecture/engineering-artifacts.md)
определяет descriptors типов/папок, начальный binding ENG-08 (§8) и формат
будущих generated-секций.
Эта карта пока остаётся авторской; генератор и переход отдельных секций
планируются в ENG-15, текущая metadata и правила не заменяются.

## Материалы задач

Локальные референсы, скриншоты, снимки страниц, логи и черновики хранятся
в соседнем каталоге [.ai-workspace/](../.ai-workspace/README.md), сгруппированными
по задачам. Его правила принадлежат
[операционному слою](rules/scope-control/RULE-TASK-WORKSPACE-ARTIFACTS.md).
Вход — [шаблон TASK](templates/task-workspace/TEMPLATE-TASK.md), исполнение
создания через Task Manager и lifecycle локального резерва —
[task-workspace](tools/task-workspace/README.md).
Закрытые quiescent досье сохраняются в `.ai-workspace/history/<localKey>/`;
runtime stores инструментов остаются у собственных владельцев.

## Локальное состояние инструментов

`.ai/tools/agent-runtime/runtime/` содержит локальное состояние выполнения и
документы его форматов. В Git сохраняются только индексы и схемы. Создаваемые
данные — SQLite, реестр и история сеансов, сообщения, входные данные и
результаты внешних агентов, снимки обслуживания — исключаются по
[правилам `.gitignore`](tools/agent-runtime/.gitignore).

`.ai/tools/task-workspace/runtime/` содержит locks, recovery-журналы операций
локального досье и привязки/replay intake Task Manager без credentials.
Это состояние инструмента, а не второй источник server task status;
оно не переносится вместе с результатами задачи и не сохраняется в Git.

## Связанные документы

Проектный контекст и настройки Codex имеют отдельные входные документы:

- [Назначение, настройка и запуск проекта](../README.md).
- [Фактические возможности проекта](../documentation/project-context.md).
- [Структура приложения](../documentation/architecture/project-structure.md).
- [Сборка, публикация и развёртывание](../documentation/delivery/INDEX.md).
- [Адаптер Codex](../.codex/README.md).
