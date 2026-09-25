# RULE-SEARCH-SCOPE-DISCIPLINE

```yaml
artifact_id: RULE-SEARCH-SCOPE-DISCIPLINE
artifact_type: project-development-rule
owner_layer: .ai/rules/development/
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
check: .ai/checks/pre-implementation/CHECK-SEARCH-SCOPE-DISCIPLINE.md
related_rule: .ai/rules/worker-runtime/RULE-WORKER-DIALOG-COORDINATION.md
registry: .ai/registry/rules/development/INDEX.md
rule_scope: project-wide
scope: repository_search
status: active
tools:
  - rg
  - .ai/tools/agent-search/bin/agent-search.mjs
```

## Область и способ работы

Перед поиском файлов, владельца, повторно используемого решения или evidence
определи цель, ожидаемый тип источника, явные пути и способ ограничения выдачи.
Предпочитай `rg` и `rg --files`. CLI `agent-search` применяет готовые профили;
его использование не обязательно, если прямой поиск сохраняет те же границы.

Основной агент и worker могут искать напрямую. Отдельный search-worker нужен
только для полезной независимой подзадачи по правилу координации. Direct/native
поиск не требует SQLite session, monitor, bootstrap или peer edges. При
делегировании передай адресату краткие findings с путями и строками через
реальные средства выбранной среды; managed metadata применяется только в
явно выбранном managed external режиме.

## Профили поиска

| Профиль | Источники |
| --- | --- |
| `code` | `src/`, `packages/`, `services/`, `tests/`, `scripts/` |
| `docs` | `documentation/`, корневые `README.md`, `AGENTS.md`; Markdown |
| `code-docs` | Код и документы из двух профилей выше |
| `ai-active` | `.ai/rules`, `checks`, `workflows`, `roles`, `registry`; `.codex/skills`, `agents`, `prompts` |
| `ai` | `.ai/` без истории, отчётов и generated runtime state |
| `codex` | `.codex/` |
| `next-routes` | `src/app/` без quarantined/reference surface |
| `payload` | `src/payload.config.ts`, `src/collections`, `globals`, `blocks`, `migrations`, `packages/payload-ai-plugin/src` |
| `ui` | `src/app`, `components`, `providers`, `blocks`; `packages/ui-kit/src`, `packages/payload-ai-plugin/src/admin` |
| `migrations` | `src/migrations/` |
| `domain` | Quarantined `src/RealizeCore/`; требуется причина |
| `search-layer` | Quarantined `src/RealizeCore/services/search`, `data/searchProfiles`, `collections/Search`; требуется причина |
| `reference` | Только явно выбранные пути референсов или исторического evidence; требуется причина |
| `special` | Только явно выбранные пути для локального исключения из профилей; требуется причина |

Точные списки CLI принадлежат
`.ai/tools/agent-search/src/searchProfiles.config.mjs`. Фактических owners
сверяй с `documentation/architecture/project-structure.md` и исходниками.
Наличие legacy профиля не делает его источники активной реализацией.

## Ограничения

- Обычный поиск исключает зависимости, `.next`, `dist`, `build`, `coverage`,
  бинарные файлы, изображения, архивы, SQLite/JSONL и generated
  `.ai/tools/agent-runtime/runtime/**`. Не читай секреты и production dumps.
- Обычные кодовые профили исключают `src/RealizeCore/**`,
  `src/app/_realize/**`, `src/app/(reference)/**`; обычные документы —
  `documentation/reports/**` и `documentation/temp/**`. Историю и референсы
  выбирай адресно по текущей задаче через `reference`/`special` с причиной.
- Lock-файлы нужны только для dependency/package audit, установки или
  обновления. Нужный lock-файл выбирай явным путём с причиной.
- `--path` расширяет поиск только существующим путём внутри репозитория.
  Абсолютные пути, `..` и symlink, разрешающийся вне корня, запрещены.
  Расширение профиля через `--path` требует причины. CLI является trusted
  developer tool, а не границей доступа MCP к произвольно меняемому filesystem.
- Для `reference`/`special` нужны конкретные `--path`, а не весь корень.
  Не включай целиком `.ai-workspace/tasks` ради одного task artifact.
- Ограничь вывод и уточняй широкий запрос. Совпадение не даёт разрешения
  менять найденный файл, расширять задачу или считать отчёт source of truth.

Если источник отсутствует или нужный доступ выходит за разрешённый scope,
назови конкретное ограничение и продолжай независимую работу. Повторный
approval для уже разрешённого поиска не требуется.
