# Project binding инженерных артефактов

Binding соединяет общий `@realize/engineering-runtime` с owner policies,
native metadata и шаблонами Realize. Контракт —
[ENG-03](../../../documentation/architecture/engineering-artifacts.md),
жизненный цикл записи —
[ENG-06](../../../documentation/architecture/engineering-operations.md).
Сам binding не пишет файлы, не запускает процессы и не предоставляет допуск.

Публичный вход — [projectEngineering.index.ts](src/projectEngineering.index.ts):

- `createProjectArtifactBinding(options)` реализует shared `ArtifactDescriptorPort`;
- `renderSourceTemplate(input)` и `renderAiTemplate(input)` возвращают UTF-8
  `Uint8Array` для последующего `prepareContent`;
- `ProjectArtifactError` различает invalid input, неподдержанный resolver,
  конфликт и превышение бюджета.

## Поддержанные профили

Срез авторинга агентов добавляет `codex.agent` для `.codex/agents/**/*.toml`:
`renderCodexAgent` возвращает bytes, `validateCodexAgent` принимает только
canonical TOML с name, description и developer_instructions. Проверки binding:
`agent.native` и `folder.placement`; фактическая загрузка Codex, tools/skills и
permissions ими не подтверждаются. Sandbox задаёт host родительской сессии.
План и запись используют прежний engineering runtime; отдельного writer нет.
Спецификация и границы: [авторинг агентов](../../../documentation/specifications/agent-authoring.md).

| Kind          | Placement                                                                                        | Native metadata                                                                                                      | Фактически выполненные preflight checks                                                    |
| ------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `source.util` | `<function>.util.ts` / `.mjs` / `.mts` / `.cjs` / `.cts` внутри зарегистрированного source owner | Начальный TSDoc: `@file`, `@version`, `@date`, `@description`; необязательный `@see` на documentation Markdown       | `source.header`, `source.syntax`, `source.naming`, `source.references`, `folder.placement` |
| `ai.template` | `.ai/templates/<purpose>/TEMPLATE-*.md`                                                          | Первый fenced YAML: `template_id`, `template_type: ai-runtime-markdown-template`, `owner_layer`, `related_artifacts` | `template.metadata`, `template.local-links`, `folder.placement`                            |

`source.header` переиспользует существующий
[validateSourceHeader](../source-headers/src/validateSourceHeader.validator.ts).
`source.syntax` использует установленный TypeScript для синтаксических diagnostics;
это не typecheck. В третьем срезе TASK-94 зарегистрированы также `source.service`
и `source.adapter` (`.ts/.js`), `source.component` (`.tsx/.jsx`) и companion
`source.types` (`.types.ts`, только type/interface и type-only imports/exports).
Точные имена/символы и границы заданы в [§18](../../../documentation/architecture/engineering-operations.md#18-source-profiles-третий-срез-task-94).
В одиннадцатом срезе MJS для util/service/adapter использует существующие JS parser, resolver и writer;
явные extensions, реальный Node ESM и checkJs проверяются по
[§26](../../../documentation/architecture/engineering-operations.md#26-esm-profiles-mjs-одиннадцатый-срез-task-94).
Проверяемый config использует `moduleResolution: bundler`; `NodeNext`/`Node16`
сохраняют отказ общего loader. Двенадцатый срез добавляет `.mts` к util/service/adapter
с проверкой TypeScript emit и Node до/после move —
[§27](../../../documentation/architecture/engineering-operations.md#27-typescript-esm-profiles-mts-двенадцатый-срез-task-94).
Тринадцатый срез подключает `.cjs/.cts` и прямой literal require к util/service/adapter —
[§28](../../../documentation/architecture/engineering-operations.md#28-commonjs-profiles-cjscts-тринадцатый-срез-task-94).
Используются прежние parser/resolver и native writer; shadowed/indirect require,
NodeNext/Node16 и module variants components/types вне поддержки. Четырнадцатый
срез подключает CommonJS к точным workspace exports одного owner —
[§29](../../../documentation/architecture/engineering-operations.md#29-commonjs-через-точные-workspace-exports-четырнадцатый-срез-task-94).
Naming проверяет главный символ профиля; `source.boundary` проверяет directives
относительно physical client/server policy. Чистота, смысл, consumers и необходимость публичного export остаются
предметом review и declared relationships владельца.

AI template содержит заполненные русские разделы «Назначение» и «Применение».
Он ссылается на
[базовый Markdown template](../../templates/markdown/TEMPLATE-AI-RUNTIME-MARKDOWN.md),
не получает `artifact_id`, `rule_id`, `check_id` или `status: active`.
Rule registry для этого subtype не обновляется. Текущий `ai:quality:structure`
не обходит `.ai/templates`; успешность этого gate не заменяет template checks.
`template.local-links` проверяет локальные Markdown paths и anchors через
существующий link extractor; внешние URLs этим check не проверяются.

Неизвестные kinds, active rules/checks/registries, Codex skills,
generated/mixed/vendor outputs и `@docref` без resolver получают `UNSUPPORTED`.
Непустой `relationshipRules` также требует будущего resolver: binding не
притворяется, что обновил public exports, Payload config, навигацию или registry.
Существующие legacy templates с иной metadata этим subtype не переписываются.

## Доверенная конфигурация и evidence

Move переиспользует чистые `parseSyntaxSource`, `readSyntaxModuleReference` и
`getModuleFileCandidates` из `.ai/tools/agent-search/src/`. Общий поиск и перенос
не содержат отдельных алгоритмов извлечения module expressions и расчёта кандидатов.
Move дополнительно требует единственную цель в полном inventory и сохраняет свой
ограниченный artifact profile. `readMarkdownLinkSpans` из `.ai/tools/quality/`
обслуживает и проверку, и rewrite локальных Markdown-ссылок. Общие исходники
входят в read manifest; CLI, MCP и telemetry для этого не запускаются.

`folderPolicies` передаются host configuration, а не JSON-командой. Каждая policy
задаёт `id`, `version`, existing `root`, `ownerRef`, `purpose`, `boundary` и
непустые `sourcePaths`. Root policies явно задают `allowedKinds` и
`allowedProvenance`; потомки могут сузить множества и добавить
`excludedPaths`, `requiredCheckRefs`, `relationshipRules` и `inheritsFrom`.
Excluded paths — точные workspace-relative paths с исключением поддерева.

Все физические предки применяются независимо от `inheritsFrom`: allowed sets
пересекаются, required checks и exclusions накапливаются. Дубликаты roots/IDs,
соседние или неизвестные parents и неявная смена owner отклоняются.
`.git`, secrets, dependencies/build outputs, локальные материалы, quarantine
и зарегистрированные generated outputs не разрешаются даже широкой policy.

`readReference(path)` — синхронный host callback, возвращающий bytes только
точного проверяемого reference. Host обеспечивает descriptor-relative
no-follow boundary, а binding ограничивает каждый reference 256 KiB, суммарные
bytes 4 MiB и количество 128. Ошибка, пустой или недопустимый UTF-8 reference
не считается подтверждённым. Binding не делает directory scan.
FS options принимают `descriptors(readReference)`: host создаёт binding с reader,
который предоставил общий FS adapter, чтобы bytes validation и read manifest
относились к одному evidence. Для новой конфигурации создаётся новый binding.

`definitionHash` фиксирует копию policies, bounded template inventory,
definition versions, profile sources, `movePolicy` и бюджеты. Внешняя мутация переданного
объекта не меняет binding. `readPaths` отдельно содержит прочитанные rules,
templates, validator sources и источники policy: FS planner включает их в
полный versioned manifest и повторно сверяет перед записью.

`templateIds` — необязательный trusted inventory максимум из 1024 записей.
При наличии проверяется конфликт ID с другим путём. Без него binding проверяет
соответствие ID имени файла и не заявляет глобальной уникальности; существование
самой цели, case conflicts и races проверяет общий FS adapter.

## Шаблоны и вложенные папки

`renderSourceTemplate` принимает `path`, `descriptionRu`, обязательный `body`,
явный `createdOn` и необязательные `seeRefs`. Новая шапка имеет версию `1.0.0`;
дата приходит от host. Renderer не читает часы, не выполняет код и не заменяет
содержимое заглушкой. Существующая в body обязательная шапка отклоняется.

`renderAiTemplate` принимает `path`, `templateId`, `titleRu`, `purposeRu`,
`usageRu`, непустые `sections: [{headingRu, body}]` и `relatedArtifacts`.
Metadata сериализуется штатным YAML writer; произвольный metadata object не
принимается. Native checks выполняются при render, references подтверждаются
при `resolveFile`.

`resolveDirectory` требует exact effective `folderPolicyId`, непустой `purpose`
и запланированный файл-потомок из того же batch. Новый directory name имеет
kebab-case. Папка наследует существующего owner; `.gitkeep`, пустой каркас и
автоматический README/INDEX не создаются. Проверка наличия planned descendant
не заменяет отдельного `resolveFile` для каждого файла.

Общий FS planner поддерживает `edit_file` и quarantine `remove` для authored
files. Trusted binding определяет зарегистрированный subtype по path/bytes/policy.
`prepareMove` обновляет `@file`, PATCH-версию и дату source либо
`template_id`/`owner_layer` шаблона, а также поддержанные incoming/outgoing references.
Host явно передаёт `movePolicy: { changedOn, coverage: "complete", referenceRoots,
sourcePaths }`. Без полной policy возвращается `UNSUPPORTED`.
Core перечисляет закрытую область через read-only inventory port; binding
принимает зарегистрированные source profiles и `ai.template`, не пропуская неизвестные файлы.
Проверяются финальные виртуальные paths/bytes; исходный код не выполняется.
TypeScript literal import/export/import-type/dynamic import пересчитываются по AST,
локальные Markdown links, definitions и `related_artifacts` — по точным offsets.
Source basename и execution boundary сохраняются. TASK-94 поддерживает однозначный wildcard
alias из effective tsconfig с baseUrl, одним target и одним `*` в ключе/target,
включая линейную относительную цепочку extends до восьми конфигураций.
При переносе exact alias сохраняется; перенос его цели поддержан отдельным
dependent edit одного JSONC owner `paths`, в том числе из relative extends.
Общий loader сообщает origin options; несколько nearest consumer configs
допускаются при одном paths owner и одинаковом нормализованном baseUrl. Все exact
mappings проверяются из каждого original/final контекста, включая неиспользуемые. Host подтверждает полную область всех транзитивных
consumers и write ACL owner. Прочие config остаются read dependencies, их bytes
сохраняются. Прямые config actions не включены. Контракты —
[§19](../../../documentation/architecture/engineering-operations.md#19-exact-aliases-и-config-effect-четвёртый-срез-task-94)
[§20](../../../documentation/architecture/engineering-operations.md#20-exact-paths-из-relative-extends-пятый-срез-task-94)
и [§21](../../../documentation/architecture/engineering-operations.md#21-несколько-consumer-configs-общего-paths-owner-шестой-срез-task-94).
Явные non-nearest configs подключаются через доверенный bounded
`tsconfigWrite.projectConfigPaths` (1–16 точных `.json` путей). Host подтверждает
полноту active contexts; без списка действует nearest-only ограничение. Каждый
project проверяет весь inventory, включая транзитивные imports, тем же resolver.
Native TypeScript root selection подтверждает сохранение `files/include/exclude`
до/после move; потеря или добавление entrypoint блокирует план. Selectors не
переписываются, project references/build mode и CLI overrides не включены.
Контракт — [§22](../../../documentation/architecture/engineering-operations.md#22-явные-project-configs-седьмой-срез-task-94).
При переносе целого target root поддержан wildcard config effect: один target
`directory/*` и один завершающий `*` в alias key. Вложенные/неиспользуемые mappings
того же owner меняются одним JSONC patch; aliases сохраняются после проверки
всех contexts. Широкий mapping предка остаётся прежним, а его ссылки пересчитываются
с приоритетом исходного pattern. Общие inverse/precedence/resolution используются
без второго resolver; proof specifiers ограничены общим `graphEntries` budget.
Fallback targets, affected suffix patterns, пустые roots и ambiguity дают отказ.
Контракт — [§23](../../../documentation/architecture/engineering-operations.md#23-перенос-wildcard-target-каталога-восьмой-срез-task-94).
Для workspace packages host задаёт `packageExportsWrite.path`, `workspaceRoots`
и `allConsumersInReferenceRoots: true`. Native shallow `directories` port фиксирует
нужные workspace namespaces и подключён к прежнему общему package resolver.
Один `config.package-exports` effect поддерживает root string и flat exact
subpaths со строковыми targets. Alias имени пакета сохраняется после проверки
manifest provenance и физических целей во всех nearest configs. Публичные и
unused exports обновляются тем же AST patch; package name/version и остальные
bytes остаются прежними. Прямые manifest actions этим профилем запрещены.
Host гарантирует полноту всех транзитивных consumers в referenceRoots; каталог
этого не доказывает. Несвязанные source trees не обходятся. Source inventory
ограничен 128 файлами/каталогами; shallow catalog сохраняет ACL, negative boundary
probes и budgets без symlinks. Подробности — [§25](../../../documentation/architecture/engineering-operations.md#25-каталог-workspace-без-рекурсивного-source-scan-task-94). Срез не объединяет package effect
с tsconfigWrite. Conditional/wildcard exports, package imports и legacy fallback
не включены. Контракт — [§24](../../../documentation/architecture/engineering-operations.md#24-точные-workspace-exports-девятый-срез-task-94).
Несколько bases, package extends, неподдержанные package mappings, computed imports,
require и неразрешённые relationships отклоняются. Sync и async adapters используют
один resolver agent-search; финальная ссылка проверяется в виртуальном дереве.
Negative config probes и source namespaces входят в frozen manifest. Host с
ограниченным чтением подключает `canReadReference`: read ACL проверяется при
подготовке и каждом snapshot/apply/recovery. См. [первый срез ENG-11](../../../documentation/architecture/engineering-operations.md#16-первый-срез-eng-11-план-task-93)
и [относительные extends](../../../documentation/architecture/engineering-operations.md#17-относительная-цепочка-tsconfig-extends-task-94).
Code examples, остальные bytes и line endings сохраняются.
Core включает rename, metadata edit и dependent edits в один frozen plan,
проверяет все effects до выдачи плана и до первой записи, затем каждый шаг.
Другие явные file actions в inventory или прочитанных зависимостях не допускаются.
`prepareDirectoryMove` использует тот же resolver для одного authored-дерева
одного owner, до 32 объектов с корнем и существующими пустыми каталогами.
`directoryVersion(path)` trusted FS port возвращает полную версию дерева;
preview перечисляет все source/destination paths для ACL. Receipt содержит
целевые каталоги с null hash и финальные hashes файлов/consumers без дублей.
Directory remove отклоняется. Case-only rename допускает исправление имени
source-каталога до kebab-case при сохранении owner и complete reference roots.
Переименование basename source-функции и невалидный legacy template folder
остаются неподдержанными. FS core требует отсутствующей цели в том же
case-sensitive parent; aliases и чужие folded collisions не обходятся.
Сам binding остаётся read-only; exact
version, staging, atomic rename/exchange и recovery принадлежат
`@realize/engineering-runtime`. Подробности — в
[ENG-09](../../../documentation/architecture/engineering-operations.md#14-редактирование-файлов-eng-09)
и [ENG-10](../../../documentation/architecture/engineering-operations.md#15-перенос-и-quarantine-authored-файлов-eng-10).

## Проверки и границы результата

`validatedChecks` перечисляет только выполненные owner validators.
`requiredCheckRefs` сохраняет также все дополнительные требования host policy.
Например, `project.typecheck` не попадает в `validatedChecks` вслед за удачной
проверкой header. Core обязан выполнить оставшиеся requirements через проверенный
runner либо отклонить apply; удалять checks ради записи нельзя.

Семантический review и проверки реализации binding выполняются по обычному
workflow. Этот descriptor не обещает, что создание или edit любого source
автоматически проверил типы, lint, поведение, consumers или отношения во всём проекте.

Адресные тесты binding:

```bash
node --import tsx --test .ai/tools/engineering/test/projectArtifactBinding.test.ts
```

Тесты не записывают артефакты в checkout. Реальные publication, parent identity,
lease, crash и recovery проверяются у FS owner `engineering-runtime` и в
`test/filesystemIntegration.test.ts`, который соединяет его с этим binding.
`test/filesystemMutations.test.ts` проверяет edit/quarantine, version/identity
conflicts и SIGKILL/restart, а также отказ project move без complete policy.
`test/projectMove.test.ts` проверяет metadata/reference sync, полноту inventory,
ACL до rename, итоговые hashes и SIGKILL/restart до/после каждого шага.
`test/directoryMove.test.ts` проверяет source/template trees, пустые каталоги,
полный receipt и отказ ACL потомков до plan/apply.
`test/directoryMoveFailures.test.ts` проверяет границы, коллизии, полный ACL,
drift, восемь точек настоящего SIGKILL, отказы fsync и безопасный recovery.
`test/directoryMount.worker.ts` проверяет чужой tmpfs в отдельном mount namespace.
Эта матрица требует Linux с разрешённым user/mount namespace и `python3`
для xattr; недоступная возможность приводит к явному отказу теста.
Process-crash и инъекция fsync EIO не моделируют отключение питания.
Directory slice принят пользователем 29 октября. `test/caseOnlyDirectoryMove.test.ts`
добавляет case-only collisions/drift, owner/ACL, восемь SIGKILL и fsync/recovery.
Результат TASK-68 в описанных границах принят переходом пользователя к TASK-93
29 октября 2026 года. Клиентская активация и установленная приёмка остаются
отдельными этапами.
Границы и бюджеты — [§15.1 протокола](../../../documentation/architecture/engineering-operations.md#151-контракт-project-move-с-metadata-и-ссылками).
Directory scope — [§15.2](../../../documentation/architecture/engineering-operations.md#152-ограниченный-directory-move).
Case-only scope — [§15.3](../../../documentation/architecture/engineering-operations.md#153-case-only-rename).
