# Типы инженерных артефактов и назначение папок

Версия: **1.8.0**, 29 октября 2026 года. Статус: **Target specification**
с начальным project binding TASK-66 / ENG-08 (§8).
Результат TASK-61 / ENG-03. Архитектурный владелец —
[ADR-0019](decisions/ADR-0019-shared-engineering-operations.md).
Полный каталог descriptors и генераторов остаётся целевым. Программная реализация
двух authored profiles и начального binding описана в §8. Exact-version edit для
этих profiles принадлежит [ENG-09](engineering-operations.md#14-редактирование-файлов-eng-09),
core move и quarantine — [ENG-10](engineering-operations.md#15-перенос-и-quarantine-authored-файлов-eng-10).
Project move этих profiles синхронизирует metadata пути и поддержанные ссылки
без обхода native validators в полной bounded host-области
([ENG-10, §15.1](engineering-operations.md#151-контракт-project-move-с-metadata-и-ссылками)).
Ограниченный перенос дерева одного owner реализован
([§15.2](engineering-operations.md#152-ограниченный-directory-move)): до 32 объектов,
включая существующие пустые каталоги, полный receipt и ACL потомков.
Расширенные проверки границ, ACL, коллизий и directory crash/recovery выполнены;
этот срез TASK-68 принят пользователем 29 октября. Case-only rename описан в
[§15.3](engineering-operations.md#153-case-only-rename): FS core поддерживает
отсутствующую цель в том же case-sensitive parent; project binding сохраняет
naming guards, включая отказ basename source-функции и legacy template folders.
Результат ENG-10 принят переходом пользователя к TASK-93 29 октября;
это не подтверждает клиентскую активацию или установленную приёмку.
Без явной complete move policy перенос отклоняется; широкие semantic relationships
и остальные kinds остаются целевыми.
Матрица текущей и целевой поддержки TASK-93 находится в §9.
Клиентские file tools ещё не включены. Последующие части реализуются в ENG-11–15; полномочия определяет
[ENG-05](platform-access.md#единые-инженерные-полномочия-eng-05), а plan/preview/apply,
генерацию, journal и recovery — [протокол ENG-06](engineering-operations.md).

## 1. Источники и границы

Требования к структуре, именам и комментариям сохраняются у действующих
[правил разработки](code-naming-and-structure.md), размещение владельцев — в
[структуре проекта](project-structure.md). Для AI-инструкций используются
[реестр правил](../../.ai/registry/rules/INDEX.md),
[карта .ai](../../.ai/STRUCTURE.md) и [карта .codex](../../.codex/STRUCTURE.md).
Descriptors связывают эти требования с проверяемыми параметрами инструмента;
они не вводят вторую систему правил и не загружают весь граф инструкций при
каждом создании файла. Смысл артефакта проверяет агент, формальные условия — код.

Общие типы descriptors принадлежат `packages/engineering-runtime`,
проектные определения и регистрации — `.ai/tools/engineering`. Core получает
готовый доверенный binding и не читает `.ai` или Payload самостоятельно.
Определения версионируются в репозитории, связываются с источниками требований
и проверяются перед включением. Запрос пользователя/модели не может подменить
registry, добавить generator command или назначить себе owner.

Объект описывается четырьмя независимыми признаками:

- **Kind** — назначение: компонент, правило, документация и т. п.
- **Owner** — существующий пакет/feature/инструмент и его граница исполнения.
- **Provenance** — `authored`, `generated`, `mixed` или `vendor`.
- **Placement** — допустимый путь, имя и назначение папки.

Расширение `.ts`, metadata `owner_layer` или выбранный kind не доказывают owner,
происхождение или право записи. Provenance определяется доверенным descriptor,
generator/config binding и фактическим файлом; комментарий `generated` сам по
себе не предоставляет исключение. Для новых типов не создаётся sidecar/passport
на каждый файл: применяются общие descriptors и существующая native metadata.

## 2. Логическая схема descriptor и разрешение типа

Это семантическая схема, а не готовые TypeScript exports или HTTP DTO.
Имена конкретных endpoints и operation envelope относятся к ENG-06.

| Поле                              | Содержание и проверка                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kindId`, `definitionVersion`     | Стабильный ключ вида `source.component`, `ai.rule`, `codex.skill`; положительная целая версия определения. ID не зависит от пути конкретного файла; дубликат отклоняется. Версия формата registry задаётся отдельно как `schemaVersion`.   |
| `purpose`, `ruleRefs`             | Одна ответственность и существующие источники требований. Для правил — ID/путь из `.ai/registry`, для native форматов — конфигурация владельца. Ссылки проверяются; недостающий источник не заменяется догадкой.                           |
| `ownerPolicyRef`, `pathPolicyRef` | Разрешённые owners/границы и именованные правила размещения. Пути относительны workspace; точные framework names описываются явными исключениями.                                                                                          |
| `allowedProvenance`               | Допустимые способы происхождения. Для generated/mixed дополнительно нужен binding outputs → source/recipe; исключение header не назначается по расширению.                                                                                 |
| `metadataProfileRef`              | Профиль native формата: source header, AI instruction, registry, skill, plain documentation, config, binary или task-owned schema. `none` допустим только для формата, которому metadata не нужны.                                         |
| `templateRef`                     | Необязательный зарегистрированный шаблон и его версия. Отсутствие шаблона не позволяет произвольный shell; рукописный файл создаётся по контракту владельца. Шаблон не заменяет заполненное содержимое.                                    |
| `relationshipRules`               | Нужные зависимости/регистрации: rule↔check↔registry, публичный export, Payload config, skill catalog, doc navigation. Каждый эффект ссылается на существующего владельца и включается в план.                                              |
| `generatorRef`, `checkRefs`       | Generator обязателен для generated outputs; checks задают нужные формальные проверки и семантический review. Это зарегистрированные IDs, а не команды из запроса. Недоступный required handler означает unsupported, не успешную проверку. |

Вызов передаёт намерение, путь и при необходимости предлагаемый `kindId`.
Исполнитель разрешает их через доверенные owner/folder bindings:

1. Проверяет workspace, исключённые области и нормализованный путь. Absolute
   paths, traversal, symlink-выход и коллизии не меняют разрешённую область.
   Точные FS race/lease гарантии принадлежат ADR-0019 и ENG-06.
2. Применяет зарегистрированные owner boundaries и ограничения всех родителей.
   Точный native/generated binding учитывается до общих правил имени. Независимые
   совпадения не выбираются по порядку массива: конфликт требует уточнения binding.
3. Сопоставляет назначение, native формат и provenance. Для существующего файла
   использует фактическое содержимое/metadata; для нового — валидирует вход
   шаблона и итоговое содержимое. Одного суффикса для семантической гарантии мало.
4. Возвращает resolved descriptor/version, effective folder policy, связанные
   эффекты и checks либо явные `unclassified`, `ambiguous`, `unsupported`, `conflict`.
   Неопределённый тип можно исследовать; typed write ждёт корректного binding.

Универсального `generic-file`, обходящего ограничения, нет. Новый формат
добавляется небольшим descriptor у правильного owner, с примерами и адресными
проверками. При новой ответственности исходника сначала согласуется
[правило именования](../../.ai/rules/development/RULE-CODE-NAMING.md).

## 3. Начальный каталог типов

Пути ниже — допустимые области при установленном owner, не разрешение писать
во весь glob. Все собственные source-типы наследуют правила структуры/headers;
native имена сохраняются. Типы расширяются по реальной потребности, без пустого
каркаса под каждый пункт таблицы.

| Kind / назначение                                              | Размещение и имя                                                                                                                                  | Создание, связи и адресная проверка                                                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source.component`                                             | Feature UI владельца в `src`, `packages/<owner>/src`; `Name.component.tsx`, при отдельных обязанностях `.view.tsx` / `.container.tsx`             | Представление не содержит запросов/бизнес-решений; primitives остаются базовыми. Публичные props/exports, React boundary, профильные UI проверки по изменению.                                                         |
| `source.hook`                                                  | Рядом с владельцем; `useName.hook.ts` для React, `<action>.hook.ts` для Payload                                                                   | Один hook на файл, без JSX. React/Payload variant обязателен; правила lifecycle и регистрации выбираются по variant.                                                                                                   |
| `source.service`                                               | Feature приложения, пакета, `services/<owner>/src` или `.ai/tools/<owner>`; `<action>.service.ts`                                                 | Одна прикладная операция; порты зависимостей, адресный unit/integration check по риску.                                                                                                                                |
| `source.repository`, `source.adapter`, `source.controller`     | У соответствующего feature owner; `.repository.ts`, `.adapter.ts`, `.controller.ts`                                                               | Разные kinds, не взаимозаменяемые суффиксы. Хранилище/транспорт не присваивают бизнес-правила; DTO и consumers проверяются на границе.                                                                                 |
| `source.validator`, `source.mapper`, `source.util`             | У владельца контракта; `.validator.ts`, `.mapper.ts`, `.util.ts`                                                                                  | Validator проверяет, mapper преобразует, util чистая. Поля публичного ответа ограничены [DTO-правилом](../../.ai/rules/development/backend/RULE-DTO-CONTRACTS-NO-RAW-PAYLOAD.md).                                      |
| `source.types`, `source.dto`                                   | Рядом с предметным контрактом; `Name.types.ts`, рукописные `.d.ts` при назначении                                                                 | Декларации без исполняемой логики. DTO — назначение публичного типа, не обязательный новый файл `.dto.ts`; native/generated Payload types не копируются вручную.                                                       |
| `source.config`, `source.constants`, `source.exports`          | `<name>.config.ts`, `<name>.constants.ts`, `<owner>.index.ts`                                                                                     | Runtime schema оформляется как существующий contract/config владельца; новые suffix conventions не выводятся из старых `.schemas.ts`. Index нужен на публичной границе; только явные exports, client/server разделены. |
| `source.payload-definition`                                    | Активные `src/collections`, `src/globals` либо конфигурация plugin owner; `.collection.ts`, `.global.ts`, `.access.ts`, `.field.ts`, `.plugin.ts` | Variant выбирает native registration и checks. Изменение source может потребовать штатного `generate:types` / `generate:importmap` / `migrate:create`; DB apply — отдельное действие.                                  |
| `source.framework-entry`                                       | Действующая Next route group; `page.tsx`, `layout.tsx`, `route.ts` и другие подтверждённые native имена                                           | Маршрут и server/client boundary проверяются. Нативное имя не отменяет header; Payload-generated bridge имеет generated provenance.                                                                                    |
| `source.style`, `source.asset`, `source.test`                  | У UI/asset/test owner; native CSS/binary/spec conventions                                                                                         | Стиль следует текущей системе темы; asset учитывает происхождение/лицензию; тест сохраняет discovery и имя проверяемого владельца. Binary не получает текстовый header.                                                |
| `ai.rule`, `ai.check`                                          | `.ai/rules/<domain>/RULE-*.md`, `.ai/checks/<stage-or-domain>/CHECK-*.md`                                                                         | Применимый Markdown template, metadata/profile и registry связи. Check описывает проверку существующего требования. Правило не копируется в `.codex`.                                                                  |
| `ai.workflow`, `ai.role`, `ai.registry`                        | `.ai/workflows/<domain>/<name>/WORKFLOW.md`, `.ai/roles/<group>/<role>/INDEX.md`, `.ai/registry/rules/<shard>/INDEX.md`                           | Workflow задаёт порядок, role — ответственность, registry — маршрутизацию. Имена `INDEX.md` различаются по owner/purpose, не дают один kind автоматически.                                                             |
| `ai.template`, `ai.navigation`                                 | `.ai/templates/<purpose>/TEMPLATE-*.md`; вход существующего раздела                                                                               | Шаблоны имеют template metadata, навигация — содержательные ссылки и условия чтения. Metadata навигации сохраняется там, где есть machine consumer.                                                                    |
| `codex.skill`, `codex.skill-interface`, `codex.prompt`         | `.codex/skills/<name>/SKILL.md`, опциональный `agents/openai.yaml`; `.codex/prompts/<domain>/*.md`                                                | Native skill frontmatter; UI YAML по своему формату; prompt связан с `.ai` workflow. Skills catalog обновляется по необходимости, не создаётся отдельный набор проектных правил.                                       |
| `doc.specification`, `doc.adr`, `doc.report`, `doc.navigation` | `documentation/architecture`, `specifications`, `reports`; существующие INDEX/README                                                              | Статус/владелец/ссылки по назначению. Исторический отчёт не становится активной инструкцией, ADR имеет номер и статус. Project Markdown не получает AI runtime metadata автоматически.                                 |
| `config.native`                                                | Зарегистрированные `package.json`, `tsconfig.json`, tool configs, `.codex/config.toml`, agent JSON/TOML                                           | Формат и обязательное имя сохраняются; для executable/comment-capable source применяется header rule. JSON не получает комментариев. Agent JSON Git и native agent TOML — разные consumer formats.                     |
| `task.material`, `task.local-record`                           | Материалы в `.ai-workspace/tasks/<key>/{references,screenshots,snapshots,logs,drafts,tmp}`; резервные TASK/manifest — только у task-workspace     | Материал не создаёт задачу. TASK/manifest изменяются через их владельца, с существующими revisions/retention. Успешный server intake не создаёт локальный TASK.                                                        |

Generated output — provenance конкретного kind: например `source.types` у
`src/payload-types.ts`. Если формат результата непрозрачен core, его native kind
регистрируется вместе с recipe. Нельзя переклассифицировать output в authored
для обхода генератора. `vendor` сохраняет происхождение и лицензию; его обновление
идёт через владельца зависимости/импорта, а не обычный source template.

Не все source roles требуют нового starter template. Там, где его нет, профиль
использует [TSDoc header](../../.ai/templates/code-comments/TEMPLATE-TSDOC-FILE-HEADER.md)
и правила владельца. Генератор не создаёт фиктивную реализацию или пустой export.

## 4. Metadata без изменения native форматов

| Профиль                              | Обязательства и совместимость                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Собственные source/executable config | `@file`, `@version`, `@date`, `@description` по [правилу комментариев](../../.ai/rules/development/RULE-CODE-COMMENT-DISCIPLINE.md). Shebang/directives сохраняются; при move меняется `@file`. Generated/vendor/JSON/binary исключения подтверждаются происхождением/форматом.                                                |
| Активная AI instruction              | Начальный frontmatter или первый fenced YAML по текущему consumer. Ровно один из `artifact_id`, `rule_id`, `check_id`; существующие IDs стабильны. `artifact_type`/`owner_layer` в текущей машинной схеме optional; остальные обязательства задаёт конкретный профиль/шаблон. Внутренний kind не переписывает `artifact_type`. |
| Rule/check/workflow/role             | Сохраняются родные поля `check`/`checks`, `rule`/`related_rule`/`related_rules`, `owner_role(s)`, `runtime_sources` и т. п. Workflow `checks: null` не выдаётся за список checks. Внутреннее нормализованное представление допустимо, массовая перезапись metadata не требуется.                                               |
| Registry shard                       | `schema_version: 2`, metadata и отдельный YAML `entries`; root registry INDEX имеет иной профиль. Существующая entry schema и условия coverage сохраняются; новые поля не добавляются на основании одного примера.                                                                                                             |
| Codex skill / interface              | `SKILL.md`: YAML frontmatter `name`, `description`, далее процедура. `agents/openai.yaml` — отдельный native YAML; не обязателен каждому skill, не превращается в AI instruction. Его schema не подтверждается Markdown quality parser.                                                                                        |
| Template / документация / материалы  | `template_id/template_type` принадлежат шаблонам; AI runtime template не применяется автоматически к `documentation`, `.codex` или package README. TASK frontmatter/manifest принадлежат workspace schemas. Остальные документы используют формат своего владельца, без универсального `status: active`.                       |

Текущий [parser](../../.ai/tools/quality/parseInstructionMetadata.mapper.ts)
проверяет часть формальных условий, а
[graph check](../../.ai/tools/quality/checkInstructionGraph.service.ts) — IDs,
ссылки и некоторые обратные связи. Их наличие не доказывает полную проверку
смысла или схемы всех вариантов: специальный rule→check backlink check сейчас
обрабатывает одиночный `check`, а не весь массив `checks`.

Новые генераторы должны планировать обе стороны связей и регистрацию; расширение
проверки массивов/форматов относится к ENG-14/25 с сохранением совместимости.
Текущий parser также обрабатывает поздний YAML-блок с `entries:` как registry
data: шаблон не вставляет такой пример в active instruction как безвредную иллюстрацию.
Заимствованный пример или текст артефакта не регистрирует новые tools/полномочия.

## 5. Назначение папок и наследование

`FolderPolicy` задаётся для owner boundary или осмысленного поддерева в project
binding, не отдельным файлом в каждой папке. Логические поля: `policyId`,
`definitionVersion`, `root`, `purpose`, `ownerRef`, `inheritsFrom`, `allowedKinds`,
`allowedProvenance`, `boundary`, `entrypointPolicy`, `excludedPaths`, `checkRefs`.
Допустимы только известные parents; циклы, orphan и неоднозначные boundaries
отклоняются при загрузке registry. `boundary` различает owner/feature/client/server/
contracts/generated/materials; это характеристика назначения, не новая директория.

Физические предки пути применяются всегда. `inheritsFrom` явно ссылается на
policy IDs этих предков и проверяет связь; родитель из соседней ветви запрещён.
Отсутствие этой ссылки не отключает ограничения физических предков. На корневой
границе допустимые множества задаются явно, без неявного значения «всё».
`allowedKinds` и `allowedProvenance` пересекаются, `excludedPaths` и обязательные
`checkRefs` объединяются с устранением повторов. Отсутствующее поле наследуется;
пустое allowed-множество запрещает соответствующие артефакты, пустой список
исключений/checks не удаляет родительские требования. Пустой результат пересечения
не заменяется более широким default.

`entrypointPolicy` фиксирует конкретный path/kind относительно boundary, где
объявлена, а не требование иметь INDEX в каждом потомке. Унаследованная обязанность
сохраняет этот абсолютный в пределах workspace адрес. Потомок может добавить
необходимый собственный вход, но не удалить существующее обязательство;
несовместимые kind/format одного входа дают conflict. Отсутствие поля/нового
требования не создаёт файл. Смена owner допускается только явным boundary
переходом, сохраняя ограничения предков; простое поле `ownerRef` их не отменяет.

- Обычная вложенная feature-папка наследует владельца и ограничения ближайшего
  binding; дополнительный descriptor нужен лишь при новом назначении/ограничении.
  Общие запреты сохраняются, allowed kinds сужаются пересечением. Дочерняя папка
  не включает запрещённый parent kind и не отменяет generated/vendor provenance.
- Переход к другому owner или client/server границе задаётся явно. Более длинный
  путь не разрешает молча сменить owner или расширить права. Для необходимых
  отличий меняется доверенный boundary binding в разрешённой задаче.
- Новый top-level path, пакет, сервис или tooling owner — архитектурное изменение;
  нужны назначение, consumers, зависимости и навигация. Уже разрешённое заданием
  изменение выполняется без повторного согласования; иначе уточняется область.
- Создаются только папки, нужные фактическому содержимому. Структура не требует
  `hooks/`, `types/`, `services/` внутри каждого компонента, README+INDEX или `.gitkeep`.
  Пустая папка допустима только для заявленного runtime назначения у его owner,
  а не как будущий каркас репозитория.
- Вход AI-раздела — существующий осмысленный `INDEX.md`, `WORKFLOW.md`, `RULE-*`,
  `CHECK-*`, `PROFILE.md` или иной согласованный документ. Для `.codex/skills`
  действующий каталог — `README.md`; у самого skill вход `SKILL.md`.
  Package README, public exports index и Markdown navigation — разные роли.
- `.git`, secrets, dependency/build outputs, private runtime state и quarantined
  области исключаются из обычного authored file binding. Generated операции
  имеют только явные outputs; runtime state пишет его сервис. Полные native
  права owner-host не становятся правами generic repository API.

Перенос внутри owner сохраняет kind и повторно проверяет путь/имя, header и
consumers. Перенос через boundary требует плана изменения владельца и ссылок.
Дочерние файлы папки классифицируются по отдельности: mixed или generated subtree
нельзя переносить/удалять как один неклассифицированный authored объект.
Конкретный diff/recovery и выполнение — ENG-06/10–12.

## 6. Authored и generated-секции карт

Сейчас `.ai/STRUCTURE.md` и `.codex/STRUCTURE.md` — авторские выборочные карты.
ENG-15 вводит generated-секции только явным переходом: выбирает исходники,
покрытие, владельца recipe и части текста, которые остаются авторскими.
В этой задаче маркеры в реальные карты не добавляются.

Формат будущей секции в Markdown:

```markdown
<!-- realize:generated:start id="ai-instruction-tree" -->

...результат зарегистрированного генератора...
<!-- realize:generated:end id="ai-instruction-tree" -->
```

ID стабилен и уникален внутри документа; start/end должны совпадать. Вложения,
повторы, незакрытая секция и непредусмотренная секция дают ошибку без записи.
Маркеры рассматриваются только как standalone lines вне fenced code blocks,
поэтому этот пример не является настоящей generated-секцией.

У зарегистрированного section binding есть document path, section ID, recipe,
input selectors/exclusions и ordering. Маркеры в пользовательском файле сами
не назначают generator и не создают output grant. Source/config hashes и version
сохраняются в plan/receipt; каждый файл не получает отдельный manifest.

Генератор меняет только согласованный диапазон и сохраняет окружающий authored
текст. Результат детерминирован: стабильный порядок, одинаковые входы → тот же
текст, без текущих timestamps. Source changes, ручная правка generated-секции
или изменение версии документа после preview требуют нового расчёта/конфликтной
диагностики по ENG-06, а не silent overwrite. Случайный unclassified файл не
становится новой active registry entry лишь из-за появления на диске.

Правила вычисления tree/navigation и списка активных instructions принадлежат
разным recipes. Generated registry entries должны проходить родную YAML/schema
проверку; структурная карта не является доказательством runtime загрузки инструкции.

## 7. Совместимость и проверочные примеры

Новый каталог применяется к новым/затронутым артефактам. Он не переименовывает
массово существующие исходники, не заменяет metadata и не классифицирует всю
неизученную часть репозитория как ошибку. Старый kind/native format допускается
при явном owner binding; неизвестный или противоречивый случай получает диагностику.
При согласованном рефакторинге действующие правила именования/структуры сохраняются.

Примеры ниже — ожидаемое поведение будущего инструмента, не результаты runtime tests.
Каждая разрешённая операция дополнительно требует соответствующего задания/authority.

| Намерение                                                                  | Решение                                                                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Создать `FeatureCard.component.tsx` в существующей UI feature              | Разрешить при owner/client boundary, source header и настоящем содержимом; не добавлять пустые hook/index рядом.                      |
| Создать React hook как `loadCard.hook.ts`                                  | Отклонить React variant; использовать имя `useCard` по правилу. Payload hook не требует `use`.                                        |
| Создать `route.ts` в зарегистрированном Next application route             | Сохранить native name, проверить DTO/контекст/headers; не переименовывать в `.controller.ts`.                                         |
| Редактировать `src/payload-types.ts` как `source.types`                    | Отклонить прямую запись: generated binding требует изменить source и запустить Payload generator.                                     |
| Объявить все `src/migrations/**` generated только по каталогу              | Отклонить вывод: проверить конкретный generator/source binding. `migrate:create` не разрешает применение миграции.                    |
| Добавить правило и связанный check                                         | План включает native metadata, registry entry и обе стороны ссылок; отсутствие required registration/check не даёт полного успеха.    |
| Добавить `artifact_id` в SKILL вместо `name/description`                   | Отклонить как несовместимый native skill format; содержимое skill остаётся адаптером проектного правила.                              |
| Добавить вложенную папку с первым service у существующего owner            | Наследовать folder policy; отдельный README/INDEX или новый owner descriptor не требуется.                                            |
| Перенести server repository в client component subtree                     | Отклонить совместимость границ; смена имени/более узкий путь не даёт права включить server imports.                                   |
| Создать новый `packages/<owner>`                                           | Обработать как новое архитектурное назначение с consumers/exports; внутри уже разрешённого задания повторное разрешение не требуется. |
| Обновить дерево между registered markers в карте                           | Preview только derived-секции с сохранением авторского текста; malformed markers или stale inputs блокируют apply.                    |
| Записать скриншот к серверной задаче                                       | Создать материал в выбранном workspace-каталоге; не создавать локальный TASK/manifest как побочный эффект.                            |
| Передать неизвестное расширение/вид с `kindId: generic-file`               | Не исполнять write; показать unclassified/unsupported и нужного owner для регистрации.                                                |
| Создать `package.json` с TSDoc header либо `.gitkeep` ради пустого каркаса | Отклонить несоответствующий формат/назначение; JSON остаётся JSON.                                                                    |

Приёмка ENG-03: схема расширяема, owner/path/provenance не смешаны с правами,
native metadata и folder inheritance определены, generated source явен,
примеры проверены относительно действующих правил. Исполняемые проверки
полного каталога classifiers/templates/sections относятся к ENG-07–15/25 и не подменяются
наличием этого документа. ENG-04 далее проектирует lifecycle и связи задач;
ENG-05/06 добавляют authority и протокол применения этих descriptors.

## 8. Начальный project binding ENG-08

TASK-66 добавляет `.ai/tools/engineering` с публичным входом
`src/projectEngineering.index.ts`. Общий `ArtifactDescriptorPort` находится в
`packages/engineering-runtime/src/artifacts`: core получает trusted binding и
не импортирует `.ai`. Профили первой реализации намеренно ограничены:

| Kind          | Поддержанное размещение                                                                              | Native validation                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source.util` | `<function>.util.ts` / `.mjs` / `.mts` / `.cjs` / `.cts` у зарегистрированного existing source owner | Source-relative TSDoc, синтаксис TS/JS, реализация функции с соответствующим именем, существующие `@see` references.                                                       |
| `ai.template` | `.ai/templates/<purpose>/TEMPLATE-*.md`                                                              | Первый fenced YAML с `template_id`, `template_type`, `owner_layer`, `related_artifacts`; заполненные разделы «Назначение»/«Применение» и локальные Markdown links/anchors. |

`ai.template` использует subtype `ai-runtime-markdown-template`. Он не получает
`artifact_id`, `rule_id`, `check_id` или `status: active` и не требует регистрации
как правило. Существующие legacy metadata не переписываются. Текущий structural
graph check не обходит `.ai/templates`; проверка этого subtype принадлежит
binding и не выдаётся за расширение покрытия active-instruction parser.

`createProjectArtifactBinding` копирует доверенные folder policies и bounded
template inventory. Root policies явно задают allowed kinds/provenance;
ограничения всех физических предков пересекаются независимо от `inheritsFrom`.
Исключения и обязательные checks накапливаются; неизвестные policy obligations,
orphan/соседнее наследование и неявная смена owner отклоняются. Вложенная папка
требует `purpose`, exact effective `folderPolicyId` и файл-потомок в том же batch.
Автоматических INDEX, README, `.gitkeep` и пустых каркасов нет.

Binding читает только exact references через bounded callback хоста. Его
`definitionHash` фиксирует конфигурацию и profile versions, а `readPaths` содержит
фактические rule/template/policy/validator sources для FS manifest. Проверка
наличия, case conflicts и descriptor-relative FS границы остаётся в общем core.
Factory binding получает reference reader от FS adapter, связывая validation
bytes с evidence текущего manifest.
Глобальная уникальность template ID без предоставленного host inventory не
заявляется; ID должен совпадать с именем файла.

Чистые `renderSourceTemplate` и `renderAiTemplate` возвращают заполненные UTF-8
bytes. Source renderer принимает явные path, description, дату и code body;
AI renderer — native ID, русские назначение/применение, sections и references.
Renderer не читает часы, не выполняет код и не предоставляет write authority.
Перед записью bytes проходят descriptor validation наравне с content, полученным
другим способом.

`validatedChecks` содержит только реально выполненные preflight guards:
`folder.placement`, source header/syntax/naming/references/boundary либо template
metadata/local-links. Это не typecheck, lint, проверка чистоты функции или
семантическая приёмка. Дополнительные `requiredCheckRefs` host policy сохраняются;
при отсутствии нужного runner операция отклоняется до live эффекта. Неизвестные
relationships, public-export/registry/config updates, active AI rules/checks,
Codex skills и generated/mixed/vendor outputs требуют следующих resolvers.

Параметры, бюджеты и примеры —
[README project binding](../../.ai/tools/engineering/README.md).
Реальное создание и его content/staging описаны в
[ENG-08 протоколе](engineering-operations.md#13-создание-файлов-и-папок-eng-08),
edit с проверкой версии — в [ENG-09](engineering-operations.md#14-редактирование-файлов-eng-09).
Описание состава реализации не заменяет адресную приёмку; результаты проверок
учитываются в отдельных source-bound receipts.

## 9. Матрица инженерных изменений ENG-11

TASK-93 / ENG-11.1, состояние кода на 30 октября 2026 года. Матрица разделяет
чтение, изменение и клиентское подключение; целевые строки не являются
реализованными profiles. Основание — рабочее дерево `main`, HEAD
`f50dc0f9410c6aacae65e1ee12e2120fc46a3647`, с незакоммиченными результатами ENG-10 и первых девяти срезов TASK-94.
Версии исследованных исходников и сохранённые проверки перечислены в результате
TASK-93 и текущей карточки TASK-94; hash HEAD сам по себе не описывает это рабочее дерево.

Седьмой срез добавляет явные non-nearest `tsc --project` configs одного paths
owner: общий resolver проверяет все contexts, native TypeScript selectors
подтверждают сохранение root files до/после move. Полный каталог активных projects
задаёт host; auto-discovery, project references/build mode и переписывание
`files/include/exclude` не включены. Контракт и границы —
[§22 инженерного протокола](engineering-operations.md#22-явные-project-configs-седьмой-срез-task-94).

Восьмой срез переносит целые wildcard target roots `directory/*` с сохранением
alias keys и specifiers через один JSONC owner effect. Проверяются вложенные и
неиспользуемые mappings, reachable members и прежний pattern широких aliases;
fallback/suffix/пустые roots и неоднозначность блокируют план. Контракт —
[§23](engineering-operations.md#23-перенос-wildcard-target-каталога-восьмой-срез-task-94).

Девятый срез добавляет один dependent `config.package-exports` effect при переносе
внутри workspace package. Root string или flat exact subpaths сохраняют имена
imports соседнего workspace. Каталог читает общий resolver через native shallow namespace port; provenance
подтверждает manifest/subpath, включая unused exports. Source inventory ограничен
referenceRoots; полноту транзитивных consumers задаёт host, не каталог
([§25](engineering-operations.md#25-каталог-workspace-без-рекурсивного-source-scan-task-94)).
Manifest keys/version и остальные bytes не меняются. Conditional/wildcard mappings,
legacy fallback, CommonJS, несколько owners и объединение с tsconfigWrite не включены.
Контракт — [§24](engineering-operations.md#24-точные-workspace-exports-девятый-срез-task-94).

Одиннадцатый срез добавляет `.mjs` к существующим util/service/adapter profiles
через общую регистрацию. Parser/resolver/writer переиспользованы; native Node ESM
и `checkJs` проверяют изолированные examples до/после move. Полнота consumers,
права и границы сохраняются. Контракт —
[§26](engineering-operations.md#26-esm-profiles-mjs-одиннадцатый-срез-task-94).

Двенадцатый срез подключает `.mts` к тем же util/service/adapter profiles.
Runtime specifiers `.mjs` разрешаются в MTS source общим resolver; реальный
TypeScript emit и исполнение результата в Node проверяются до/после move.
Compiler output остаётся вне authored source inventory и удаляется после проверки.
Контракт — [§27](engineering-operations.md#27-typescript-esm-profiles-mts-двенадцатый-срез-task-94).

Тринадцатый срез добавляет CommonJS `.cjs/.cts` к util/service/adapter.
Прямой literal require, TS import-equals и CommonJS emit используют общий AST/resolver;
engineering передаёт reference mode и консервативно отклоняет shadowed require.
Relative/aliases, native Node/CTS emit и recovery —
[§28](engineering-operations.md#28-commonjs-profiles-cjscts-тринадцатый-срез-task-94).
CommonJS package exports, обычные `.js/.ts` CommonJS по package type и NodeNext/Node16
не включены.

### 9.1. Identity, область и владельцы

| Изменение           | Identity и сохраняемый контракт                                                                                                                                                   | Владелец                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Путь файла/дерева   | Exact source version, owner и namespace. Перенос не переименовывает символ автоматически; public entrypoints и consumers требуют отдельного доказанного эффекта.                  | Project binding и engineering-runtime.                                             |
| Имя функции/символа | Объявление и связанные usages в конкретном TypeScript project; shadowing и одноимённые символы различаются. Текстовый поиск такой identity не доказывает.                         | Общий semantic analysis в agent-search; запись через engineering-runtime, TASK-97. |
| ID артефакта        | Native ID и уникальность в registry/domain inventory. Изменение пути не означает смену ID. Исключение текущего ai.template: имя файла и template_id связаны явным owner contract. | Native metadata/registry owner и project binding, TASK-95/96.                      |

Сочетание этих изменений допускается только при явном owner contract в одном
preview. Исходники компонента, route, service и config при одинаковом расширении
сохраняют разные placement, public-export и client/server ограничения из §3.
Новый суффикс файла сам по себе не регистрирует write profile.

Общие условия текущего move: authored profile одного owner, доверенная
`coverage: complete` policy, полный inventory, ACL всех effects/consumers,
frozen read/write manifest, journal и recovery по
[§15.1–15.3](engineering-operations.md#151-контракт-project-move-с-metadata-и-ссылками).
Полнота относится к host roots; отсутствие внешних consumers не предполагается.
Пределы: 16 roots, глубина 16, 128 файлов/128 каталогов, 256 KiB на candidate,
4 MiB inputs, 64 effects, 128 KiB preview; дерево — до 32 объектов с корнем.
Generated обновляется через generator owner, mixed/vendor и неизвестные kinds
не становятся authored от выбора поля запроса. Политики read и write независимы.

### 9.2. Фактическая поддержка и сценарии расширения

В колонке «Изменение» указана готовность project plan/apply/validation.
Сценарии в будущих строках — критерии реализации, а не результаты выполненных тестов.

| Артефакт / связь                                                              | Чтение и resolution сейчас                                                                                                | Изменение сейчас                                                                                                                                                                                                                                                                                                                                                                                                              | Следующий этап и приёмочный сценарий                                                                                                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| source.util, относительные literal import/export, import-type, dynamic import | Общий AST и кандидаты; move требует единственной цели в закрытом inventory.                                               | Реализованы create/edit/move; basename и имя функции сохраняются, metadata/consumers обновляются.                                                                                                                                                                                                                                                                                                                             | Baseline TASK-68: перенос util с incoming/outgoing ссылкой, финальные hashes; ambiguous target отклоняется.                                                                                    |
| source.util / ai.template directory и case-only                               | Полный tree inventory, включая пустые каталоги.                                                                           | Реализован bounded move; ASCII case-only в одном case-sensitive parent при отсутствующей цели.                                                                                                                                                                                                                                                                                                                                | Baseline TASK-68: Left → left; ACL потомка, collision, drift и recovery. Case-insensitive alias и source basename rename отклоняются.                                                          |
| Обычные TS/JS/TSX/JSX и .mts/.cts/.mjs/.cjs                                   | Общий parser и resolver поддерживают эти расширения; read support не выдаёт write profile.                                | Подключены service/adapter (.ts/.js/.mjs/.mts/.cjs/.cts), util (.ts/.mjs/.mts/.cjs/.cts), component (.tsx/.jsx), types (.types.ts) с native guards. MJS — §26, MTS — §27, CommonJS — §28; остальные roles не подключены.                                                                                                                                                                                                      | TASK-94, §18: смешанное дерево, service/component consumers, client/server, typecheck, ACL/drift/recovery. Route/config/public entrypoint остаются отдельными cases.                           |
| tsconfig paths/baseUrl/относительные extends                                  | Поиск разрешает поддержанные конфигурации через общий resolver; ограничивает moduleResolution/rootDirs и неоднозначность. | Реализован wildcard move зарегистрированных source profiles, включая линейную relative extends цепочку до восьми config, без изменения их bytes. Exact и whole-directory wildcard config effects одного собственного/унаследованного paths owner поддержаны при совместимой baseUrl и полном host scope nearest/explicit contexts — §19–23. Несколько bases/owners, разные физические baseUrl и fallback targets отклоняются. | §16–17 протокола: preview/apply/receipt, ACL всей цепочки, drift bytes/extends edge/nearer config, retry и recovery. Остальные конфигурации — TASK-94.                                         |
| Workspace packages, exports, conditions, barrels                              | Общий поиск поддерживает ограниченные workspace mappings и re-export navigation.                                          | Реализован opt-in перенос внутри package с одним exact exports effect; shallow workspace catalog и отдельный source inventory (§25), все nearest contexts, сохранение specifiers и проверка manifest provenance — §24. CommonJS .cjs/.cts с import/require mode — §29.                                                                                                                                                        | Соседний workspace consumer, compiler oracle, ACL/catalog drift и recovery проверяются отдельно. Conditional/wildcard package mappings, legacy fallback и несколько owners остаются в TASK-94. |
| ai.template: Markdown и native metadata                                       | Общий extractor links/reference definitions, anchors и template validation.                                               | Реализованы move/rename с template_id/owner_layer/related_artifacts и links. Переименование заголовка как отдельная операция отсутствует.                                                                                                                                                                                                                                                                                     | Baseline TASK-68; TASK-95 расширяет contract anchors: linked heading/explicit ID и collision, сохранение code examples.                                                                        |
| Обычный Markdown, документация, навигация                                     | Quality извлекает ссылки и anchors; это ещё не owner profile документа.                                                   | Project move таких документов не подключён.                                                                                                                                                                                                                                                                                                                                                                                   | TASK-95: путь/anchor и входящие ссылки; metadata сохраняется по назначению, encoded target имеет единую семантику проверки/rewrite.                                                            |
| rules/checks/workflows/skills и registry entries                              | Существуют metadata schemas и проверки графа инструкций.                                                                  | Эти kinds и перенос регистраций ещё не поддержаны binding.                                                                                                                                                                                                                                                                                                                                                                    | TASK-96: перенос каждого принятого native формата, сохранение/явная смена ID, обновление registry и прямых consumers; дубликат ID отклоняется.                                                 |
| Функции, символы, import/export aliases                                       | Синтаксические definitions/references и import navigation; семантическое связывание всех usages не заявлено.              | Semantic rename отсутствует.                                                                                                                                                                                                                                                                                                                                                                                                  | TASK-97: переименование выбранного символа с shadowing, type usages и public exports; одноимённый чужой символ сохраняется.                                                                    |
| Вычисляемые imports/paths из конечных выражений                               | AST видит выражение; общего доказанного множества целей пока нет.                                                         | Computed imports и неоднозначные path strings отклоняются.                                                                                                                                                                                                                                                                                                                                                                    | TASK-98: const/template literal/конечная map; все варианты согласованы, unknown/side effects/переполнение блокируют полную синхронизацию.                                                      |
| Связи с внешним runtime-контекстом                                            | Доверенный versioned domain resolver для этого изменения ещё не подключён.                                                | Автоматический rewrite отсутствует.                                                                                                                                                                                                                                                                                                                                                                                           | TASK-99: конкретный owner manifest с provenance/ACL/актуальностью; missing/expired/changed context блокирует старый план.                                                                      |
| Generated, delete/restore, generators                                         | Существуют штатные generators и ограниченный core quarantine regular file.                                                | Общие delete/restore с consumer sync и registry генераторов ещё не готовы.                                                                                                                                                                                                                                                                                                                                                    | TASK-70/71/73; generated output обновляется источником/recipe, не прямой заменой файла.                                                                                                        |

CommonJS require/import-equals, неоднозначные directory/index candidates и
неподдержанные config modes сохраняются явными строками ограничений TASK-94;
наличие AST node не означает разрешённый rewrite. Расширение не ослабляет
проверки naming, ACL, source/config drift и восстановления из ENG-10.

### 9.3. Доступность и источники доказательств

| Вход                                 | Состояние инженерных операций                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Встраиваемый runtime/project binding | Реализован ограниченный baseline; проверяется через фактические native fixtures. Host задаёт policies и полномочия.                   |
| CLI/IDE                              | Общий клиент инженерных операций планируется в TASK-79. Наличие agent-search/task-workspace/Git CLI не подключает move автоматически. |
| MCP/GPT                              | Подключение plan/apply/status/recover — TASK-80. Текущие repository read tools не предоставляют эти write операции.                   |
| Admin                                | Preview/результаты/права/recovery — TASK-81. Сохранённый fixture preview не является экраном Admin.                                   |
| Установленная эксплуатация           | TASK-86/88; installed search acceptance остаётся incomplete. Изолированная приёмка не подтверждает реальный ChatGPT.                  |

Основные фактические owners:
[binding](../../.ai/tools/engineering/src/createProjectArtifactBinding.service.ts),
[profiles](../../.ai/tools/engineering/src/ProjectArtifactBinding.types.ts),
[source move](../../.ai/tools/engineering/src/rewriteSourceMove.util.ts),
[template move](../../.ai/tools/engineering/src/rewriteTemplateMove.util.ts),
[parser](../../.ai/tools/agent-search/src/parseSyntaxSource.util.mjs),
[module resolver](../../.ai/tools/agent-search/src/resolveModulePath.service.mjs),
[config loader](../../.ai/tools/agent-search/src/loadImportConfiguration.service.mjs),
[Markdown extractor](../../.ai/tools/quality/readMarkdownLinks.util.ts).

Evidence baseline хранится у TASK-68: `eng-10-search-reuse-result.json`, SHA-256
`295e3aa8d68364dee315a311ec401af25afca431e07963e6a247a123a34ac78c`;
14 итоговых checks и 234 адресных теста относятся к зафиксированным входам.
TASK-93 не перезапускает их ради матрицы. Первый срез TASK-94 изменяет общий
resolver и проходит новые source-bound checks; прежний receipt не подменяет
проверку изменённых входов. Чтение исходника и результат команды различаются.
План первого расширения — [§16 протокола](engineering-operations.md#16-первый-срез-eng-11-план-task-93).
