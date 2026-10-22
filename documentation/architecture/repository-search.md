# Поиск для агентов и диагностика

Статус: current implementation.

Поиск помогает находить действующие файлы, объявления, использования и связанные
участки кода. Английский и русский — приоритетные языки проверки; механизм
обрабатывает Unicode независимо от языка. CLI и MCP поддерживают синтаксическую
навигацию TS/JS и явное разрешение статических imports без постоянного индекса.
Полного семантического связывания символов нет;
метрики сами по себе не доказывают релевантность выдачи.

## Владельцы

| Слой                                                                                                                                                  | Ответственность                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `.ai/tools/agent-search/bin`, `src`, `test`                                                                                                           | Offline CLI, профили, фильтры, bounded rg и явный экспорт диагностики                    |
| `.ai/tools/agent-search/src/analyzeSyntaxFile.util.mjs`, `syntaxDeclarations.util.mjs`, `syntaxImports.util.mjs`                                      | Общий чистый TS/JS parser, определения, usages и module specifiers                       |
| `services/ai-control-plane/src/searchRepository.service.ts`                                                                                           | MCP text/syntax поиск, безопасное чтение, координаты и snapshot                          |
| `packages/ai-contracts/src/repositoryNavigation.schemas.ts`                                                                                           | Intent, syntax metadata и явное покрытие навигации                                       |
| `.ai/tools/agent-search/src/parseImportTopology.util.mjs`, `resolveImportLinks.service.mjs`, `resolveModulePath.service.mjs`                          | Общий граф bindings/exports, цепочки и адреса модулей                                    |
| `.ai/tools/agent-search/src/loadImportConfiguration.service.mjs`, `createImportReadContext.service.mjs`                                               | Bounded metadata, request cache, бюджет и snapshot footprint                             |
| `.ai/tools/agent-search/src/runImportResolution.adapter.mjs`                                                                                          | CLI inventory/ignore, область доступа, чтение и компактная выдача                        |
| `services/ai-control-plane/src/resolveRepositoryImports.service.ts`, `createImportReadAdapter.adapter.ts`                                             | Strict MCP I/O, DTO и cursor разрешения imports                                          |
| `packages/ai-contracts/src/importResolution.schemas.ts`                                                                                               | Строгие target/chain/reasons и coverage статического разрешения                          |
| `services/internal-mcp/src`                                                                                                                           | Авторизация, общий budget, ответ MCP и измерение вызова                                  |
| `.ai/tools/agent-search/src/searchObservationSpool.adapter.mjs`                                                                                       | Ограниченная native SQLite очередь CLI в ignored runtime инструмента                     |
| `services/ai-control-plane/src/LocalSearchObservationCollector.service.ts`                                                                            | Автоматическая доставка очереди CLI через существующий pg Pool                           |
| `packages/ai-contracts/src/searchObservation*.schemas.ts`, `SearchObservationManagement.types.ts`                                                     | Строгие DTO события, настроек, очистки и состояния                                       |
| `packages/payload-ai-plugin/src/search-observability`                                                                                                 | Очередь, repository событий и управления, runtime monitor, endpoints                     |
| `packages/payload-ai-plugin/src/collections/SearchObservations.collection.ts`                                                                         | Схема закрытого временного хранилища                                                     |
| `packages/payload-ai-plugin/src/collections/SearchObservationState.collection.ts`                                                                     | Закрытый singleton политики, heartbeat и последних операций                              |
| `packages/payload-ai-plugin/src/admin/search-observability`                                                                                           | История, фильтры, настройки, подтверждение очистки и состояние доставки                  |
| `.ai/tools/agent-search/benchmark`, `acceptance`                                                                                                      | Корпуса, проверка покрытия/бюджетов, lifecycle временной инфраструктуры и общий отчёт    |
| `tests/e2e/search-observability.e2e.spec.ts`, `tests/e2e/support/searchAcceptance.config.ts`, `tests/e2e/support/searchObservationRuntime.fixture.ts` | Настоящие CLI/HTTP MCP collectors, изолированная БД и автоматическая диагностика в Admin |

Managed MCP передаёт событие observer-у после формирования ответа. Collector
копирует проверенный DTO в очередь, раз в секунду передаёт batch существующему
пулу Payload. Коллекция не имеет публичных CRUD-прав. Admin использует только
allowlist DTO через `GET /api/realize-ai/search-observations` и
`POST /api/realize-ai/search-observations/import`; оба требуют
`canManageAIConfiguration`. При изменённом `routes.api` используется путь установки.
Управление использует тот же доступ и префикс: `GET /control`,
`POST /settings`, `GET /cleanup-preview?mode=expired|history`, `POST /cleanup`.
Мутации принимают строгий JSON до 4 KiB и UUID `Idempotency-Key`.

CLI автоматически записывает обезличенный DTO в
`.ai/tools/agent-search/runtime/search-observations.sqlite`. Буфер принадлежит
инструменту и исключён из Git, CLI и MCP поиска. Native `node:sqlite` доступен
в штатном Node 24.18.0 без дополнительной зависимости. CLI не подключается к
PostgreSQL, Admin, сети, модели или секретам. Busy timeout равен нулю: занятая
или недоступная SQLite пропускает замер, сохраняя stdout и exit code поиска.
Каталог имеет права 0700, файлы — 0600; symlink/hardlink отклоняются. Очередь
содержит максимум 100 событий за 7 дней, файл SQLite ограничен 1 MiB;
временный rollback journal также ограничен размером БД. При переполнении
сохраняются новые события, число вытесненных отмечается в локальном счётчике.

Существующий control plane раз в секунду забирает максимум 100 событий,
повторно проверяет строгую schema и источник CLI, записывает через общий
`SearchObservationStore` и подтверждает удаление только после успеха БД.
При отказе БД события остаются в очереди; повтор с backoff до 30 секунд
идемпотентен по eventID. Изолированный runtime (`REALIZE_AI_RUNTIME_ISOLATED=true`)
этот consumer не запускает. Пока control plane выключен, сохраняется только
ограниченный локальный буфер; обычный поиск продолжает работать.

Дополнительный экспорт в новый файл задачи остаётся необязательным инструментом
отладки. Он использует тот же eventID, что автоматическая доставка:

```bash
node .ai/tools/agent-search/bin/agent-search.mjs \
  --within=packages/payload-ai-plugin --limit=10 \
  --metrics-file="$PWD/.ai-workspace/tasks/<task>/logs/search.json" \
  SearchObservation
```

Страница «Диагностика поиска» (`/admin/ai/search` при стандартных routes)
не требует загрузки файла или отдельного запуска. Первая страница видимой
вкладки обновляется каждые 2 секунды; скрытая вкладка отменяет запросы и polling.
При ошибке данные сохраняются, повтор использует backoff до 30 секунд.
Старые страницы не переключаются автоматически; «Обновить» возвращает к новым.
CLI имеет origin `import` — локально предоставленные замеры, а не подтверждённое
сервером выполнение. В UI это «Локальные замеры». Существующий авторизованный
API импорта сохранён для автоматизации: один JSON до 8 KiB,
`Idempotency-Key=eventID`. Отдельная файловая форма импортирует только summaries
качества benchmark; она не импортирует сырые поисковые события.
В Payload пункт находится в «AI & Delivery», в системной оболочке —
«AI → Контроль и качество → Диагностика поиска». Обе ссылки ведут в один view.
Bootstrap MCP, обычный `rg` и другие поисковые инструменты в историю не попадают.
Пустая история не доказывает отсутствие поисковых вызовов.
Для расхождения часов CLI допускается время до 5 минут в будущем.

### Аналитика оптимизаций

«Скорость и полнота выполнения» в той же странице строится сервером по всем
сохранённым событиям выбранного периода (1 час, 24 часа или 7 дней). Источник
CLI/MCP, потребитель и операция сужают график и сравнение. Фильтры результата, длительности
и cursor применяются только к истории: выбор «Ошибка» не меняет знаменатель
полноты выполнения. Агрегаты, история и политика читаются в одной транзакции
REPEATABLE READ; события из допустимого будущего не входят в аналитику до
наступления их времени, но сохраняют видимость в истории. В ответе истории
добавлен явный DTO `analytics`; событие и схема БД
не меняются, миграции и повторное выполнение поиска не нужны.

- Среднее время — арифметическое среднее `durationMs` отдельных запросов,
  а не среднее средних точек графика. p95 считается по тем же запросам.
- Полнота выполнения — `complete / count × 100`: доля полностью завершённых
  запросов, включая полный поиск без совпадений. `partial`, `error` и
  `cancelled` остаются в знаменателе. Показатель не доказывает релевантность;
  правильность целей и coverage проверяется корпусами приёмки.
- Среднее чтение использует только измеренные `bytesRead` с явным числом
  таких замеров; `null` не заменяется нулём. Размер ответа показывается
  отдельно; CLI records и MCP JSON имеют разную упаковку.

График содержит 24 интервала одинаковой длительности. Пустые интервалы
показываются разрывами; переключатель выбирает время, полноту выполнения или
чтение. Точки доступны мышью и клавиатурой, даты отображаются в часовом поясе
браузера. Пунктир отмечает `splitAt`.

Без отметки сравниваются две половины периода. Необязательный ISO UTC
`compareAt` задаёт момент оптимизации строго внутри периода; до и после
берутся одинаковые окна максимально возможной длительности в выбранном
периоде. Событие на границе относится к окну после; правая граница исключается.
Уменьшение времени/чтения считается как `(до − после) / до × 100`,
изменение полноты выполнения — в процентных пунктах. Нулевая база, неизмеренная
величина, пустая выборка или окно, обрезанное retention/очисткой, не дают
процента улучшения. Пользователь видит обе выборки и причину отсутствия сравнения.

Это наблюдаемая динамика, не причинное доказательство эффекта изменения:
источник, операция, состав запросов, нагрузка и кеш влияют на результат.
Предел записей и потери доставки могут сокращать обе выборки. График по сырым
событиям использует raw retention (максимум 7 дней). Отдельная дневная история
сохраняет 180 дней агрегатов UTC без запросов, путей и исходного кода. Она общая
для всех потребителей, не меняется при фильтрации истории и не сохраняет p95.
Накопление выполняется под тем же lock; duplicate eventID не увеличивает счётчики.
Автоматическая raw cleanup оставляет агрегаты, ручная очистка истории удаляет
соответствующий период и его контрольные замеры. Очищенное не возвращается при
поздней доставке.

### Качество контрольных задач и версии

`qualityRuns` в benchmark отчёте отделяет правильность известных целей от
завершения файлового запроса. Navigation проверяет точный файл и строку anchor;
import-resolution — точный target либо ожидаемый отказ и цепочку developer
workflow. Summary хранит число целей и правильных ответов, время всей задачи,
calls, фактические filesRead/bytesRead и outputBytes; неизвестное чтение — null.
Это оценка корпуса, а не правильности произвольного ответа модели.

Корпус и runtime sources имеют SHA-256. `--release=<отметка>` задаёт явный релиз;
по умолчанию отметка `working-tree`. Первый проход — `initial`, следующие —
`repeat` с номером повтора; кеш ОС не сбрасывается. Сравниваются одинаковые
corpusVersion/consumer/cache/repeat/число целей. Изменение правильности показывается
в процентных пунктах, изменения времени/calls/read — отдельно. Нулевая база
не даёт процентной экономии.

`POST /api/realize-ai/search-observations/quality-import` требует
`canManageAIConfiguration`, UUID `Idempotency-Key`, strict JSON до 32 KiB и
1–20 summaries. Повтор ID с тем же содержимым идемпотентен; иное содержимое
получает 409. Admin читает JSON до 2 MiB и отправляет только summaries. Существующий
JSONB state хранит максимум 64 замера за 180 дней. Окно качества независимо от
raw retention; ручная очистка фиксирует отдельную границу качества.

Поиск Admin/execution/review имеет consumer и server-owned runID. MCP без
состояния использует requestID как eventID; он не выдумывает ID диалога ChatGPT.
CLI consumer переназначается исполнителю/reviewer при доставке из его worktree.
Перед удалением worktree финальный flush передаёт неотправленные события в
SQLite буфер установки: durable enqueue предшествует ack исходной очереди.

`sourceVersion` вычисляется по явному bounded набору sources и lockfiles без Git.
Общий `packages/git-runtime/src` и typed ports `.ai/tools/git-delivery/src/read`
включены рекурсивно, вместе с package manifest и используемым secret detector.
Для этих owners обход ограничен глубиной 8, 512 entries на каталог и 1000
entries суммарно; symlinks отклоняются. Общие пределы binding остаются 1000
файлов, 2 МиБ на файл и 4 МиБ суммарно. Это связывает изменения Git execution
и read policy с новой версией источников, включая новые вложенные модули.
IDE worker и его delivery journals в этот набор не входят.
Штатная typegen → tsc → build создаёт `.next/realize-search-build.json` только
при неизменных sources. Consumers добавляют installedBuildID лишь при совпадении
source hash и настоящего BUILD_ID. Manifest переносится build owner-ом в
actual standalone build directory из bounded `required-server-files.json`:
`standalone/<relativeAppDir>/<config.distDir>` (по умолчанию `.next`), включая
изолированный custom distDir. Relative paths проверяются на traversal и выход
через symlink до чтения runtime BUILD_ID; source и standalone BUILD_ID обязаны
совпасть до записи receipts. `/api/health/live` возвращает safe searchBuild из
работающего bundle. Успешная source-сборка и её receipts не активируют web:
full preflight отдельно сверяет actual runtime с исходниками и build receipt.
Если web установлен в отдельном каталоге внутри `.next`, install owner вызывает
`activateInstalledSearchBinding` после совпадения actual health, текущего source hash
и compiled receipt. Функция атомарно создаёт generated
`.next/realize-search-active.json`; consumers читают указанный canonical bundle
в пределах `.next`. Старый основной BUILD_ID сохраняется для прежних процессов
и rollback. Указатель вручную не редактируется; traversal, внешний symlink,
несовпадающие source/build и malformed receipt не получают installedBuildID.
Старый или отсутствующий manifest не позволяет
назвать новую runtime работу установленной сборкой.

## Навигация при разработке

| Задача                                        | CLI                                                          | MCP `repo_search`                                                         |
| --------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Найти путь по имени                           | `--output=paths '*Store*'`                                   | `repo_list_files` в ожидаемой области                                     |
| Найти объявление известного имени             | `--intent=definitions SearchObservationStore`                | `intent=definitions`, `query=SearchObservationStore`                      |
| Найти употребления имени                      | `--intent=references --output=files UiButton`                | `intent=references`, `query=UiButton`                                     |
| Найти module/binding/alias                    | `--intent=imports SearchObservationStore`                    | `intent=imports`, тот же literal query                                    |
| Перейти от известного import к объявлению     | `--intent=imports --resolve-imports --from=<file> <binding>` | `intent=imports`, `resolveImports=true`, `path=<file>`, `query=<binding>` |
| Просмотреть зависимости известного файла      | `--within=<file> --intent=imports '*'`                       | `path=<file>`, `intent=imports`, `query=*`                                |
| Текст, комментарии, конфигурация, другой язык | Обычный `--intent=text`, regexp явно                         | `intent=text` по умолчанию, только literal                                |

Выбирается операция для текущего вопроса; выполнять всю последовательность
не нужно. Для syntax используй известный файл/owner через `--within` или MCP
`path`. CLI не сортирует полный репозиторий ради ранжирования. Связанный файл
уточняется по module specifier или явным разрешением imports. Обычные intents
не загружают `tsconfig`, package exports и импортированные файлы.

Общий parser использует pinned TypeScript 6.0.3 `createSourceFile`/`forEachChild`
для `.ts/.tsx/.js/.jsx/.mts/.cts/.mjs/.cjs`, включая `.d.ts`. CompilerHost,
type checker, Program и выполнение найденного кода не используются. TypeScript
объявлен runtime dependency root и CLI; `text/paths` его не загружают.
AST живёт в текущем запросе, не сохраняется в БД и не требует отдельного агента.
API выбран по [официальному Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API);
переход на compiler 7.x не входит в эту реализацию.

`definitions` ищет точное имя объявления: функции, переменные, классы, методы,
accessors, свойства, type/interface/enum/namespace и параметры. `references`
ищет точное имя в синтаксисе использования, включая JSX и shorthand; объявления,
импорты, экспортные aliases, comments/strings и closing JSX tags исключаются.
Одинаковые имена из разных scopes могут попадать вместе. Локальный alias ищется
по своему имени; для его установления используется `imports` с `name` и
`importedName`. Результаты нельзя считать доказанными ссылками конкретного символа
для автоматического rename. Anonymous default exports и вычисляемые/строковые
обращения исследуются через text и точное чтение файла.

`imports` возвращает static import/re-export, namespace/type/import-equals,
literal `import()` (включая options), `require()` и import type expressions.
Query — точное имя binding/alias либо literal часть module specifier; единственное
специальное значение `*` перечисляет все найденные module specifiers. Это не
произвольный glob или regexp. Вычисляемые module expressions не разрешаются;
одноимённая локальная функция `require` синтаксически неотличима от CommonJS.
Возвращённый module specifier не является разрешением читать указанный путь.

### Переход к исходному объявлению

Разрешение включается для конкретного вопроса по известному TS/JS файлу:

```bash
node .ai/tools/agent-search/bin/agent-search.mjs --intent=imports \
  --resolve-imports --from=services/internal-mcp/src/executeMcpTool.service.ts \
  --limit=5 searchRepository
```

MCP-эквивалент: `repo_search` с `intent: "imports"`, `resolveImports: true`,
`path: "services/internal-mcp/src/executeMcpTool.service.ts"`,
`query: "searchRepository"`, `limit: 5`. `maxDepth`/CLI `--max-depth` — 1–12,
по умолчанию 8. CLI требует `--output=matches`. `--from` выбирает стартовый
файл; `--within`, профиль, ext/glob и ignore ограничивают также зависимые исходники.
Сужение `--within` до одного файла обычно не позволяет перейти в соседний:
задай достаточную разрешённую область владельца сразу.

Результат добавляет `resolution`: `status`, `target`, промежуточную `chain`
и nullable `reason`. Target содержит path, line, column, kind, optional name;
MCP также возвращает fileSha256 прочитанных файлов. Seed уже находится в match,
поэтому цепочка его не дублирует. В этом opt-in режиме точное имя binding
во всём стартовом файле имеет приоритет над substring другого module specifier,
ещё до result limit. Для адресного module query используй путь/specifier;
обычный `imports` сохраняет прежнюю выдачу обоих видов совпадений.
Binding ведёт к объявлению, module query/`*`
или namespace — к файлу модуля (1:1). Это точность `static_imports`, не полноценный
type checker и не основание для автоматического rename. Type/value пространства
не разделяются: слияния нескольких объявлений могут дать `ambiguous`.

Shared resolver получает I/O adapter: исходник → чистый TS parser → topology
локальных imports/exports → module path → исходное объявление либо причина.
Он обрабатывает relative paths, расширения TS/JS, directory `index`, `baseUrl`,
`paths`, `moduleSuffixes`, ближайший `tsconfig.json` с JSONC/BOM и относительными
`extends`; пути унаследованных options сохраняют исходную директорию.
Workspace-пакеты берутся из root `package.json` (`workspaces` array или packages),
с фиксированными директориями либо одним завершающим `/*`. Поддержаны
`types`/`typings`/`main`, точные и wildcard subpaths `exports`, вложенные условия
`types`/`import`/`require`/`default`/`customConditions` в порядке объявления.
Именованные, local/default/namespace и star re-exports обходятся с проверкой
циклов и неоднозначности. Из нескольких function overloads выбирается реализация,
если она одна. Внешние библиотеки и builtins возвращают `external_dependency`;
`node_modules` не читается и найденный код не исполняется.

Поддержанная конфигурация — bundler и ограниченный legacy node/node10;
legacy не использует `exports`. Node16/NodeNext, rootDirs, npm/absolute extends,
typesVersions, versioned `types@` conditions, exports arrays и сложные workspace
globs дают `unsupported_configuration`. CommonJS assignments и `export =`
не связываются с именованным символом (`unsupported_export`); literal require
может разрешить сам файл. Вычисляемые imports не вычисляются. Это ограниченная
статическая навигация, без обещания полной эквивалентности compiler resolution.

Metadata читаются адресно через тот же reader; чтение конфигурации не выдаёт
права читать её targets. CLI разрешает root `tsconfig.json`/`package.json`
как metadata, остальные JSON — в исходном профиле с его ignore/exclusions.
Для этого используется один ограниченный `rg --files` inventory без содержимого:
до 10 000 имён/2 MiB. MCP сохраняет свой более строгий allowlist, secret,
descriptor и symlink/hardlink checks. Запрещённый relative/paths target
останавливает цепочку; запрещённый кандидат необязательного `baseUrl` fallback
не мешает проверить разрешённый workspace package. Это не обход политики:
запрещённый файл не читается и не появляется в результате.

Один вызов ограничен 128 реально прочитанными файлами, 4 MiB содержимого,
1024 проверками кандидатов/директорий, 256 entries одного workspace listing,
512 KiB на файл, 2048 graph entries на файл и 1000 matches. CLI останавливается
раньше при своём result/response budget. AST, удачные и неудачные чтения
переиспользуются только внутри запроса; между вызовами retained cache нет.
`resolution` coverage содержит лимиты, filesRead/bytesRead/probes,
blockedCandidates, unresolvedMatches и exhausted. Blocked candidates — пути,
отклонённые до чтения; их существование не утверждается. Они не объявляются
пропущенными файлами синтаксического анализа. Причины unresolved различают
not_found/forbidden/file_too_large, unsupported_*, syntax_error,
symbol_not_exported, ambiguous, cycle, max_depth и scan_budget.

Cursor — позиция выдачи для полностью проверенного графа. Snapshot включает
hashes источников/конфигурации, статусы отсутствующих/закрытых кандидатов и
workspace listings: появление более приоритетного файла тоже даёт `CONFLICT`.
Query binding включает resolveImports и maxDepth. При следующей странице
чтение повторяется для проверки snapshot; cursor не возобновляет прерванный
обход. При scan budget полного снимка нет, cursor не выдаётся. Вместо повторения
того же широкого `*` выбери нужный binding/известный target. `unresolvedMatches`
показывает неполноту разрешения отдельно от пагинации.

MCP добавляет к syntax matches поле `syntax` (kind, optional name/moduleSpecifier/
importedName) и к ответу `navigation`. CLI печатает kind рядом с фрагментом и
короткий footer. `navigation.precision=syntax`; счётчики `parsedFiles`,
`prefilteredFiles`, `unsupportedFiles`, `skippedFiles`, `syntaxErrorFiles`
обязательны для navigation. `prefilteredFiles` — успешно прочитанные файлы,
в которых query отсутствует и нет escapes: AST для них не создаётся, только
если поиск учитывает регистр или query содержит исключительно ASCII.
Для остальных запросов без учёта регистра prefilter отключён: Unicode lowercasing
может зависеть от контекста, который у целого файла и отдельного имени различается
(например, греческая конечная sigma). Prefiltered файлы не объявляются
синтаксически проверенными. Escaped Unicode/hex имена и строковые module specifiers
не теряются из-за prefilter. При поиске числовых имён свойств prefilter также
отключён: parser нормализует literal, например `0xff` в имя `255`.

Parser ограничен 512 KiB на файл; CLI читает кандидат bounded buffer без
symlink/hardlink, MCP сохраняет прежний строгий reader и secret filtering.
Syntax errors и слишком большие/недоступные файлы пропускаются с явным счётчиком.
`truncated` описывает pagination/scan limits; ненулевые `skippedFiles` или
`syntaxErrorFiles` отдельно означают неполное покрытие анализа даже при
`truncated=false`. Отсутствие matches в таком ответе не доказывает отсутствие
имени. Проверяй известный файл через text/read; не перезапускай тот же запрос
в надежде обойти ограничение. Unsupported languages используют text по правилам
своей области. Бюджет и отмена проверяются между чтениями и во время обхода AST;
синхронный разбор одного bounded файла не прерывается посередине.

MCP cursor включает intent и snapshot. Прочитанные файлы покрываются SHA-256,
unsupported/отклонённые — fingerprint записи; изменение содержимого прочитанного
кандидата делает старую страницу устаревшей. При продолжении scan повторяется для
проверки snapshot. Сохранение AST/сессии для cursor здесь не реализуется.

## Воспроизводимая оценка

`benchmark/repositoryNavigation.corpus.mjs` в agent-search содержит 24 реальные
задачи с независимыми текстовыми anchors. Controller вызывает настоящие CLI/MCP
adapters без диагностической очереди; один вызов с limit=5 на сценарий.
До замера anchors проверяются по исходникам: drift корпуса не превращается в
тихое ухудшение/улучшение результата. Запуск из корня с проектным Node:

```bash
node --import=tsx/esm .ai/tools/agent-search/benchmark/runRepositoryNavigation.controller.mjs
node --import=tsx/esm .ai/tools/agent-search/benchmark/runRepositoryNavigation.controller.mjs --navigation --runs=2
```

JSON stdout содержит file/anchor hits, bytes, duration, первый match и calls.
JSON protocol v2 содержит номер прогона и summary отдельно для `initial`/`repeat`.
`--runs=1..5` задаёт число последовательных проходов (по умолчанию 1).
Первый проход выполняется в новом процессе benchmark; последующие — в том же.
OS cache не очищается; это не измерение холодного диска. Старт настоящего CLI
процесса измеряется отдельно в browser fixture, для первого и повторного вызова.
Каждый из этих вызовов создаёт новый Node-процесс. Обязательные положительные
`initialWallMs` и `repeatedWallMs` входят в `phases.browser.cliProcess` общего
отчёта; отсутствие замеров отклоняет приёмку даже при успешном browser сценарии.
Сравнивай последовательные прогоны в одинаковом окружении без build/typecheck
параллельно. Корпус фиксирует полезные сценарии, не доказывает общую релевантность
или число дополнительных действий модели. Unicode/security/cursor fixtures
проверяют другие контракты и не подменяют корпус реальными результатами поиска.

`benchmark/importResolution.corpus.mjs` задаёт 14 переходов к объявлениям
и два корректных отказа для внешних зависимостей. Отдельно проверяются два
сценария «перейти → найти usages в известном owner → получить imports target»,
по три действительных вызова. Controller проверяет независимые anchors и DTO;
неуспешный сценарий завершает процесс кодом 1:

```bash
node --import=tsx/esm .ai/tools/agent-search/benchmark/runImportResolution.controller.mjs --runs=2
```

JSON содержит calls, hits/refusals, files/bytes/output и время каждого adapter.
Первый вызов включает lazy loading parser; HTTP/auth, холодный старт отдельного
CLI и действия модели не измеряются. Результаты не записываются в рабочую
историю диагностики. Усечение списка dependencies в workflow остаётся явным;
этот сценарий проверяет получение ограниченной страницы, не полный граф проекта.

Навигационный controller также завершает процесс ошибкой при недостигнутой цели.
Оба controller-а проверяют полный набор ID, каждый адаптер и прогон, число вызовов,
конечные измерения и раздельные лимиты: 8192 байта ответа на вызов, 50 MiB чтения
на navigation, 4 MiB на import resolution. В developer workflow budgets применяются
к каждому из трёх вызовов, а не к сумме страницы. Обязательны coverage без skipped
и syntax-error файлов и неисчерпанный бюджет import resolution. Unsupported languages
остаются отдельным счётчиком и не объявляются проверенными. Для navigation/import
lookup недопустима неполная выдача; ограниченная страница references/dependencies
в workflow допустима только с явной причиной лимита, сохранённой в JSON.
Latency публикуется как измерение без произвольного общего порога для разных машин.

### Полная приёмка

Admin использует тот же actual-files reader через server-owned dynamic tools.
`repositoryChatTools.int.spec.ts` проверяет поиск вне Git checkout, текущие
hashes/строки, source links, private paths, developer ACL, narrow scope и
run-bound cursors. `codexSearchSettings.int.spec.ts` проверяет режимы direct/native,
legacy read и строгую запись; `codexReadTools.int.spec.ts` — parent/child binding
и запрет CMS callbacks child. Эти tests не заменяют установленную систему.

Диагностика такого поиска имеет существующий source `mcp` (общий repository
reader), optional `consumer=admin`, `runID` и `tool`. Это числовая allowlist без
запроса, пути или исходного кода. Поиск и последующее чтение имеют отдельные
события. Ошибка telemetry не повторяет файловый запрос и не меняет ответ.

```bash
npm run check:search
```

Полный запуск сначала сверяет `.next/realize-search-build.json` с текущими
sources и `SEARCH_ACCEPTANCE_INSTALLED_EVIDENCE` — bounded strict JSON evidence
оператора. Для `admin-direct`, `admin-subagent`, `execution`, `review`, `cli`,
`mcp`, `chatgpt` нужны свежие `confirmedAt`, `evidenceKind=operator-confirmed`
и UUIDs действительно сохранённых событий. События сверяются read-only с рабочей
БД: consumer, source/build, search → read, runID системных агентов. Ссылки Admin,
MCP и ChatGPT повторно проверяются по actual file hash и строке. ChatGPT также
требует подтверждённый пользователем URL реального диалога в одном из форматов:
`https://chatgpt.com/c/<id>` или `https://chatgpt.com/g/g-<slug>/c/<id>`.
Evidence сохраняет точную исходную строку без переписывания URL проекта в
обычный URL, trim или иной нормализации. Допустимы только HTTPS и точный host
`chatgpt.com`, без credentials, порта, query, fragment и пробельных символов.
Общая длина ограничена 256 символами; `<id>` содержит 8–128 ASCII букв, цифр
или дефисов, `<slug>` — 1–128 таких символов после обязательного `g-`.
Purpose credential или SDK запрос пользовательского подтверждения не заменяет.
Evidence оператора подтверждает выполнение пользовательского сценария;
read-only DB проверка доказывает доставку его событий с текущим source/build.
При отсутствии обязательного контура итог — `incomplete`, exit 1 до тяжёлых checks.

`npm run check:search:isolated` запускает только fixtures; итог `isolated_passed`
явно не подтверждает установленную систему или внешний ChatGPT. CI использует
этот режим. Исходный full command не имеет skip-флага внешнего контура.

Вход `acceptance/runSearchAcceptance.controller.mjs` затем последовательно проверяет:

1. CLI regressions, repository/protocol/navigation, delivery и consumers suites: Admin contracts/UI, native lifecycle, execution/reviewer, worktree handoff, quality и installed refusal boundaries.
2. Все 24 navigation и 16 import-resolution сценариев для CLI/MCP в двух прогонах,
   а также по два developer workflow для каждого адаптера и прогона.
3. Managed MCP, PostgreSQL storage/aggregate/quality и management тесты. Каждая DB suite
   получает новую уникальную БД с настоящими миграциями.
4. HTTP MCP и CLI → автоматические collectors → PostgreSQL → `/admin/ai/search`:
   доступ и навигация, отказ delivery port и автоматический retry без повторного
   поиска, dedupe, фильтры, сохранение настроек, отмена/подтверждение очистки,
   сохранение нового события после preview и запрет возврата очищенных событий.

JSON validators отклоняют пустые, пропущенные, failed/todo и повторно успешные
browser тесты; обязательные suites не могут стать зелёными из-за отсутствующей БД.
Подготовка выполняет typegen, TypeScript и production-сборку существующим
`scripts/runtime/buildProduction.controller.mjs`, затем запускает сгенерированный
standalone `server.js` с его public/static assets.
Сборка и начальная загрузка API/Admin завершаются до таймаута пользовательского
browser сценария; runner сообщает этап подготовки и отказывает при его ошибке.
Обычный общий запуск тестов без fixture URI не является полной приёмкой поиска.
Время HTTP/очереди/UI не смешивается с benchmark адаптеров. `modelCalls=0` означает
отсутствие вызова модели самим тестируемым поиском, не оценку стоимости работы агента.

`SearchAcceptanceProcess` владеет только запущенными им process groups, ограничивает
время и журналы, скрывает fixture credentials, завершает зависшие процессы.
Database adapter создаёт native PostgreSQL на Linux под обычным пользователем;
пароль `initdb` передаётся через FIFO, не через argv или обычный файл.
Он не наследует рабочий env приложения. CI может явно передать только отдельный
loopback service `realize_ci`; изменения разрешены только в БД, созданных этим run.

Browser запускается на отдельном порту из source snapshot без `.env`, upload-данных
и runtime-данных. Состав копирования принадлежит
[`createSearchAcceptanceSnapshot`](../../.ai/tools/agent-search/acceptance/createSearchAcceptanceSnapshot.adapter.mjs):
он включает точечные транзитивные imports из `scripts/release` и `.ai/tools/quality`,
необходимые для TypeScript-проверки копируемых `scripts/runtime/evaluation`.
Комплектность проверяется разрешением локальных imports в созданном снимке;
generated `.next/types` создаёт штатный `next typegen`. Evaluation harness,
проверяющий полный агентский слой, запускается из исходного checkout.
Workspace exports `@realize/*` ведут в пакеты этой копии. Сторонние
dependencies используются из существующей установки; второй набор исходников
checkout не добавляется в TypeScript/Next graph.
Next генерирует файлы внутри собственного snapshot в `tmp/browser-*`
каталога текущей приёмки. Он находится внутри checkout, поэтому
`REALIZE_BUILD_TRACING_ROOT` ограничивается корнем этого проекта и охватывает
общие dependencies без расширения до `/`. Граница проверяется
[владельцем production-сборки](../delivery/01-local-admin-ai.md);
Browser-приёмка использует общий упаковщик `scripts/runtime/standalone`: новый
bundle содержит static/public assets и внутренние относительные ссылки на
traced dependencies. Raw standalone сохраняется внутри snapshot, а пакет —
рядом с ним в том же временном каталоге. Случайный readiness marker подтверждает принадлежность HTTP listener-а
данному snapshot. Снимок, БД и процессы убираются в cleanup; рабочий сервер
и очередь поиска не перезапускаются. Неперехватываемый SIGKILL/авария ОС требуют
адресной очистки оставшейся fixture инфраструктуры по её каталогу/PID.
Для typegen/TypeScript задан предел V8 heap 2048 MiB; low-memory Next/его workers
после успешного tsc получают heap 1024 MiB и отключённый webpack cache.
Для Playwright/Node workers задан heap 512 MiB;
это не предел суммарного RSS PostgreSQL, Chromium и всех дочерних процессов.
Vitest и Node tests выполняются с одним worker. `REALIZE_BUILD_LOW_MEMORY=true`
снижает Next page/static workers до одного. Webpack в fixture компилирует модули последовательно (`NEXT_WEBPACK_PARALLELISM=1`)
и завершается до запуска Chromium, освобождая память компилятора.
Недостаток памяти означает отказ приёмки, а не разрешение пропустить browser.

Артефакты находятся в `.ai-workspace/tasks/<date>-search-acceptance-<suffix>/`:
`reports/acceptance.json` содержит итог и фактические counts, отдельные JSON —
детали тестов и benchmark, `logs` — bounded вывод, `browser` — screenshot и замеры
старта CLI. Trace/video отключены, чтобы не сохранять auth-запросы. CI загружает
только эти evidence directories, без временной БД и source snapshot, на 7 дней.
Условия запуска — в [README инструмента](../../.ai/tools/agent-search/README.md#проверки),
процедура Codex — [search-acceptance](../../.codex/prompts/search-acceptance.md).

## Измерения и ограничения

Не сохраняются запрос, path, glob, причина расширения CLI, snippet, содержимое
файла, cursor, credential, сообщения произвольных ошибок и model prompt.
Только enum, UUID, время, числа, nullable показатели и фактически применённые
бюджеты. Неизвестное значение — `null`, а не ноль. Токены модели не оцениваются
по размеру ответа и сейчас всегда `null`.
События поиска не содержат actor. Закрытый bounded журнал управления хранит ID
администратора и hash запроса для защиты повторов; публичный mapper их исключает.

- `durationMs` — длительность измеряемого поиска; у MCP включает авторизацию,
  выполнение и формирование результата, у CLI — работу адаптера rg.
- `firstMatchMs` — время первого найденного совпадения, не доставка пользователю.
- `candidateFiles` — разрешённые кандидаты MCP либо отобранные к моменту
  завершения кандидаты CLI; при ограничениях это не полный размер репозитория.
  Для opt-in resolution MCP это число probes (включая metadata и отсутствующие
  кандидаты), CLI — число имён в bounded inventory; это разные виды работы.
- `filesRead` / `bytesRead` MCP учитывают успешно проверенное содержимое.
  Они не включают filesystem metadata и чтение файлов, отклонённых валидатором.
  CLI не делает дополнительный проход ради метрик: для rg content-поиска они `null`.
  Syntax CLI измеряет уже выполняемое чтение; для `paths` оба равны нулю.
  Исключение — opt-in import resolution обоих adapters: callback считает
  фактические bytes, включая последующий content rejection или cancellation.
  Чтение конфигурации включено; cached данные внутри вызова повторно не считаются.
- `excludedFiles` MCP — отказы при чтении выбранных файлов, не все исключения
  обхода. В syntax CLI это отклонённые при bounded чтении файлы; у rg не измеряется.
  В resolution сюда входят также policy-blocked probes; отдельный счётчик
  blockedCandidates в coverage не утверждает существование этих путей.
- `outputBytes` CLI — строки результатов UTF-8 без служебного footer; MCP — JSON
  объекта result без HTTP/JSON-RPC framing. Эти единицы явно указаны в событии.
- `partial`, причина ограничения и наличие следующей страницы различаются.
  MCP cursor привязан к principal/policy/query/content snapshot. Следующая
  страница заново проверяет snapshot; это не возобновление незаконченного чтения.
  CLI cursor не выдаёт. Operation различает `definitions/references/imports`
  и прежние output modes; queryKind для `imports '*'` — `glob`.
  Пропуски анализа дают outcome `partial`, reason `analysis_coverage`, если нет
  более приоритетной ошибки или ограничения. Admin показывает эту причину;
  query/path/code при этом по-прежнему не записываются.
- Колонки CLI — байты UTF-8 от 1, MCP — Unicode code points от 1. Это не UTF-16
  offsets и не визуальные grapheme clusters. Combining marks, emoji и ZWJ
  последовательности не сводятся к одному символу. Автоматической Unicode
  нормализации нет; NFC и NFD могут давать разные совпадения.
  Начальный UTF-8 BOM пропускается декодером CLI; MCP сохраняет его как отдельный
  code point. Поэтому совпадение сразу после BOM имеет колонку 1 в CLI и 2 в MCP.
  CRLF сохраняет номера строк. Координаты относятся к декодированному тексту
  поиска, а не к абсолютному смещению в исходном файле.

## Хранение и эксплуатация

Defaults — 7 дней, 10 000 событий, обслуживание каждую минуту. В Admin можно
выбрать 1–7 дней, 100–10 000 событий и 1–60 минут. Диапазоны принадлежат
`searchObservationManagement.constants.ts`; очередь 100 и порог медленного
поиска 1 секунда остаются фиксированными в `searchObservation.config.ts`.
Это настройки диагностики: доступ к файлам, бюджеты поиска и ограничения MCP
через эту страницу не изменяются.

`SearchObservationControl` хранит строгий singleton в `realize_ai_search_state`:
политику с revision, границу очищенной истории, результат последней очистки,
до 32 runtime snapshots за сутки и до 20 административных операций. Сохранение
использует expected revision (CAS); устаревший ввод получает 409. Уменьшение
retention/capacity удаляет лишние записи в той же транзакции. Возврат прежних
лимитов не восстанавливает удалённые данные. Применение подтверждается ответом
с новой revision; heartbeat каждого сборщика отдельно сообщает appliedRevision.

Ручная очистка сначала получает count, серверную границу времени и revision.
Диалог позволяет отменить действие; подтверждение действительно пять минут,
проверяет revision и неизменность count. «Удалить устаревшее» удаляет только
истёкший период, «Очистить историю» — события с observedAt строго раньше границы
preview. Новые события после границы сохраняются. При рассинхронизации часов
события из допустимого будущего также остаются. Устойчивая clearedBefore
блокирует возврат очищенного периода из очереди/импорта после рестарта; допустимая
поздняя доставка подтверждается без повторной записи. Повтор UUID с тем же
actor и содержимым возвращает прежний результат; другой запрос получает 409.
После вытеснения receipt из bounded журнала повтор защищён старой revision.

Запись, настройки и очистка используют один advisory transaction lock.
Подключение ожидается до 1,5 секунды, SQL — до секунды, блокировка — до 200 ms;
ошибка не меняет результаты поиска. Страницы истории идут по монотонному ID,
сводка относится ко всем выбранным фильтрам периода. При каждой записи
соблюдаются retention/capacity; чтение также учитывает текущую политику.

Оба существующих сборщика запускают `SearchObservationRuntimeMonitor`: при
старте и каждые 10 секунд он сообщает состояние и проверяет срок обслуживания,
даже когда поисков нет. Due check под общей блокировкой предотвращает повторную
очистку несколькими процессами. CLI control plane обслуживает хранилище без
managed MCP. Если оба процесса выключены, обслуживание возобновится при запуске;
отдельного daemon нет. PostgreSQL переиспользует удалённые строки через обычное
обслуживание БД; уменьшение числа записей не обещает немедленного уменьшения
размера файла. UI показывает физический размер с индексами и state.

MCP collector сохраняет batch при временном отказе БД и повторяет доставку с
backoff 2–30 секунд в пределах очереди 100. Неверный DTO/конфликт не вызывает
бесконечного retry; переполнение и остаток очереди при завершении учитываются
как потери. MCP очередь находится в памяти и теряется при crash. CLI буфер
сохраняется на диске; его счётчик включает наблюдаемое вытеснение и отклонённые
события, но не может измерить все отказы записи в недоступный буфер.
Сборщики не повторяют поиск, а сообщения ошибок не содержат исходные данные.
Это operational telemetry, не финансовый учёт и не полный audit.

Состояние Admin обновляется раз в 10 секунд в видимой вкладке, при ошибках —
backoff до 60 секунд. Черновик настроек и предыдущие данные сохраняются;
конфликт чужого изменения отмечается явно. Heartbeat старше 35 секунд считается
задержанным, старше 90 — недоступным; свежий сигнал с ошибкой доставки/буфера —
сбоем. Показаны очередь, учтённые потери, последняя доставка, сбой, appliedRevision
и последние операции. Отсутствие heartbeat означает неизвестное состояние.
Аналитика не служит автоматическим основанием ослаблять защиту поиска.

Миграции генерируются из collections через
`scripts/migrations/search-observations.mjs` и `search-observation-state.mjs`.
`down` первой отказывает при событиях, второй — при revision > 1, сохраняя
решения администратора и durable cutoff. Схема применяется до новой версии
web/control plane/managed MCP. Откат приложения сохраняет таблицы; данные
не удаляют ради отката. Подробности — [runbook](../delivery/03-migrations-and-rollback.md).
