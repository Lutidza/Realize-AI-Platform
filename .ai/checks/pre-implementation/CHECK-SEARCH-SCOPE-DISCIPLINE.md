# CHECK-SEARCH-SCOPE-DISCIPLINE

```yaml
artifact_id: CHECK-SEARCH-SCOPE-DISCIPLINE
artifact_type: ai-pre-implementation-check
owner_layer: .ai/checks/pre-implementation/
rule: .ai/rules/development/RULE-SEARCH-SCOPE-DISCIPLINE.md
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
registry: .ai/registry/rules/development/INDEX.md
check_stage: pre_implementation_search_scope_gate
rule_scope: project-wide
scope: repository_search
status: active
```

Перед поиском по репозиторию проверь:

- Цель, ожидаемый тип источника, конкретные include paths и способ ограничения
  выдачи понятны; готовый профиль CLI либо эквивалентный прямой `rg` подходит задаче.
- Обычный поиск исключает зависимости, generated/runtime output, секреты,
  dumps, историю и quarantined/reference contour по связанному правилу.
- Для `domain`, `search-layer`, `reference`, `special` и дополнительных
  `--path` названа причина. Для двух последних профилей указаны явные пути.
- Пути существуют внутри репозитория: нет absolute path, traversal или
  symlink за пределы корня. Историческое evidence не объявляется текущим owner.
- `--within` сужает выбранные корни после разрешения symlink; не расширяет
  профиль, не отменяет исключения и не заменяет разрешение на lock-файл.
  Glob корректно учитывает скрытые каталоги и в выдаче, и в исключениях.
- Сужение сохраняет ignore-правила исходной области. Пользовательские glob
  одинаково работают во всех режимах и фильтруют кандидатов до чтения содержимого.
- Повторный широкий поиск сужен; совпадение не расширяет разрешённый scope.
- Для навигации TS/JS выбран подходящий intent: definitions/references/imports;
  известный файл/owner передан адресно. Синтаксические usages не выданы за
  symbol references; aliases и module specifiers проверены перед изменением.
  Unsupported/skipped/syntax-errors и prefiltered отличены от parsed; отсутствие
  matches при неполном покрытии не объявлено отсутствием определения.
- Для разрешения imports выбран точный seed и binding; scope/ignore действуют
  также на targets, metadata не выдаёт source grant. Проверены chains, cycles,
  ambiguity, config precedence и budgets; причины unresolved не скрыты.
  Snapshot учитывает зависимости, конфигурацию и отсутствующие кандидаты;
  continuation отличён от возобновления scan. Измерения включают фактически
  прочитанные bytes даже при отклонении содержимого или отмене запроса.
- Выбрана минимально достаточная форма результата: пути, файлы с совпадениями
  или ограниченные фрагменты. Для обычного поиска не запускаются LLM, отдельная
  сессия, индекс или фоновая служба.
- Ограничены количество, байты и время; процесс завершается при превышении
  бюджета. Неполная выдача явно обозначена и не выдана за исчерпывающий поиск.
  Ошибка и отсутствие совпадений различаются; пропущенный путь профиля виден.
- Direct/native поиск использует средства среды без synthetic runtime state.
  Если полезная подзадача делегирована, её findings доступны назначившему агенту.
  Session/edge/monitor evidence проверяется только при выбранном managed режиме.

- При изменении диагностики проверены строгий DTO без query/code/credentials,
  отличие `null` от нуля, единицы Unicode/UTF-8, ограничения очереди/retention,
  отказоустойчивость, access и idempotency доставки. Автоматическая очередь CLI
  исключена из поиска/Git, ограничена по размеру/TTL и не ждёт БД приложения;
  повторная доставка не создаёт дубликаты. Live UI отменяет polling скрытой
  вкладки и не сбрасывает историю при сетевой ошибке. Проверки не делают поиск
  зависимым от Admin и не запускают повторное сканирование ради метрик.
- Метрики CLI, managed MCP и отсутствующее покрытие прямого `rg`/bootstrap
  различены по [контракту](../../../documentation/architecture/repository-search.md).
- Для управления хранением проверены CAS/replay, preview/cancel/confirm,
  конкуренция очистки с записью, сохранение новых событий и durable cutoff.
  Проверки удаления выполняются в выделенной fixture БД. Heartbeat и очистка
  возобновляются после рестарта и работают без managed MCP через CLI collector;
  bounded очереди, runtime snapshots и журнал операций не растут бесконечно.

- При изменении инструмента поиска или диагностики запланирована и выполнена
  полная приёмка `npm run check:search`: CLI/repository/delivery, оба CLI/MCP
  корпуса, managed и search PostgreSQL suites, browser путь до Admin.
  Проверены фактические counts без skips/todo и повторов browser теста,
  покрытие ID/целей, отдельные бюджеты чтения/ответа и cleanup fixture процессов.
  Первый и повторные замеры различены; `reports/acceptance.json` относится
  к текущему коду. Недоступный prerequisite отмечен как неполная приёмка.
  Для обычного поиска и документации этот запуск `not_required`.

Отдельный search-worker и отдельная runtime session не являются условиями
прохождения. При отсутствии поиска результат `not_required`; при нарушении
границ — конкретный blocker. Новое разрешение нужно только для действия,
которое не покрыто заданием и действующими инструкциями.

В общий результат достаточно включить существенные сведения:

```text
search_scope_discipline_check: passed|failed|not_required
search_goal:
search_mode:
include_paths:
exclusions:
reason_for_expanded_scope:
output_limit_or_refinement:
evidence: <paths and relevant line references>
blocker:
```
