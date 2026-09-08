# RULE-CODE-NAMING

```yaml
artifact_id: RULE-CODE-NAMING
artifact_type: project-development-rule
owner_roles:
  - .ai/roles/developer/frontend/INDEX.md
  - .ai/roles/developer/backend/INDEX.md
owner_layer: .ai/rules/development/
enforcement_owner: .ai/roles/process-tools-operations/scope-contour-owner/INDEX.md
check: .ai/checks/development/CHECK-CODE-NAMING.md
registry: .ai/registry/rules/development/INDEX.md
rule_scope: project-wide
scope: new_names_renames_and_refactoring
```

## Область применения

Новые имена и переименования в собственном коде приложения, пакетов, сервисов
и инструментов. При рефакторинге исправляй обнаруженные нарушения нейминга
в согласованном компоненте или модуле с учётом ограничений пользователя.
Идентификаторы — английские без транслита; имена раскрывают назначение.

## Файлы

Формат: `<base>.<role>.<extension>`. Основа обозначает сущность или операцию,
роль соответствует содержимому. Для функции основа совпадает с её именем;
для компонентов, классов и групп типов используется `PascalCase`, для функций,
конфигураций и групп констант — `camelCase`. Конфигурации коллекций и globals
Payload именуются по сущности в `PascalCase`.

`.ts` — код без JSX, `.tsx` — с JSX; `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`
выбираются по режиму исполнения. Суффиксы `Util`, `Hook`, `Fn` не добавляются
к именам функций. Роль класса (`Repository`, `Adapter`, `Error`) в имени файла
указывается один раз, после точки.

| Назначение                     | Файл → основной символ                                                |
| ------------------------------ | --------------------------------------------------------------------- |
| Компонент                      | `ConnectionForm.component.tsx` → `ConnectionForm`                     |
| Представление                  | `ConnectionForm.view.tsx` → `ConnectionFormView`                      |
| Контейнер                      | `ConnectionForm.container.tsx` → `ConnectionFormContainer`            |
| React-хук                      | `useConnectionForm.hook.ts` → `useConnectionForm`                     |
| Payload-хук                    | `resolveSearchProfileField.hook.ts` → `resolveSearchProfileField`     |
| Чистая вспомогательная функция | `formatSlug.util.ts` → `formatSlug`                                   |
| Проверка входа                 | `validateConnection.validator.ts` → `validateConnection`              |
| Преобразование данных          | `mapConnection.mapper.ts` → `mapConnection`                           |
| Прикладная операция            | `resolveConnection.service.ts` → `resolveConnection`                  |
| Хранилище                      | `GitHubConnection.repository.ts` → `GitHubConnectionRepository`       |
| Внешняя система                | `GitHub.adapter.ts` → `GitHubAdapter`                                 |
| Транспортный обработчик        | `saveConnection.controller.ts` → `saveConnection`                     |
| Коллекция Payload              | `GitHubConnections.collection.ts` → `GitHubConnections`               |
| Global Payload                 | `SiteSettings.global.ts` → `SiteSettings`                             |
| Доступ Payload                 | `resolveConnectionAccess.access.ts` → `resolveConnectionAccess`       |
| Фабрика поля                   | `createConnectionField.field.ts` → `createConnectionField`            |
| Подключение plugin             | `createGitConnectionsPlugin.plugin.ts` → `createGitConnectionsPlugin` |
| Модель с поведением            | `SearchProfile.model.ts` → `SearchProfile`                            |
| Прикладная ошибка              | `ConnectionUnavailable.error.ts` → `ConnectionUnavailableError`       |
| Типы одного контракта          | `GitHubConnection.types.ts` → связанные типы и интерфейсы             |
| Конфигурация                   | `gitConnection.config.ts` → `gitConnectionConfig`                     |
| Константы                      | `gitConnection.constants.ts` → именованные константы                  |
| Публичные экспорты             | `ConnectionForm.index.ts`, `gitConnections.index.ts`                  |

Таблица задаёт имена существующих по назначению файлов, а не обязательный
каркас. Новую самостоятельную роль сначала добавляй в правило; неподходящий
суффикс не используй для другой ответственности.

React-хуки именуются с `use` и заглавной буквой после него
([соглашение React](https://react.dev/learn/reusing-logic-with-custom-hooks)). Payload-хуки —
по действию, без `use`; жизненный цикл добавляется по смыслу:
`validateConnectionBeforeChange.hook.ts`. Для фабрики Payload-хука допустимо
`createResolveSearchProfileField.hook.ts`.

## Именованные файлы экспортов

- Используй `<owner>.index.ts` вместо безымянного `index.ts` на публичной
  границе компонента, модуля или пакета; каждому каталогу index не нужен.
- Допустимы явные именованные экспорты, `export type`, комментарии и необходимые
  обозначения границы исполнения (`'use client'`, импорт `'server-only'`).
  Реализация, `export *` и другие импорты ради побочных эффектов не допускаются.
- Внутренние файлы не импортируют собственный index. Default export допустим
  по требованию инструмента или внешнего контракта.
- Именованный index подключается явным путём или через `package.json` `exports`;
  автоматически импорт каталога его не найдёт. Расширения импортов соответствуют
  режиму исполнения или сборки
  ([точки входа Node.js](https://nodejs.org/api/packages.html#package-entry-points)).
- Для двух границ используй `gitConnections.client.index.ts` и
  `gitConnections.server.index.ts`. Сегмент имени не заменяет директиву или
  защитный импорт; клиентская граница не экспортирует серверный код, секреты
  и типы закрытых серверных результатов.

## Каталоги и идентификаторы

Каталоги — `kebab-case`: `git-connections`, `connection-form`. Имена каталогов
ролей: `components`, `primitives`, `hooks`, `types`, `services`, `repositories`,
`validators`, `mappers`, `adapters`, `controllers`, `collections`, `globals`,
`access`, `fields`, `models`, `errors`, `utils`, `config`, `constants`.
Создавай их только при необходимости размещения кода.

| Сущность                                 | Формат и примеры                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Компонент, класс, тип, интерфейс         | `PascalCase`: `ConnectionForm`, `ConnectionFormProps`; без префиксов `I`/`T` у типов и интерфейсов |
| Функция, метод, переменная, свойство     | `camelCase`: `resolveConnection`, `connectionId`                                                   |
| Предикат, boolean                        | `is`, `has`, `can`, `should`: `isEnabled`, `canManageConnections`                                  |
| Callback в props / его обработчик        | `onSubmit` / `handleSubmit`                                                                        |
| Фиксированная константа уровня модуля    | `UPPER_SNAKE_CASE`: `DEFAULT_TIMEOUT_MS`                                                           |
| Переменная окружения                     | `UPPER_SNAKE_CASE` с пространством имён: `REALIZE_GIT_TIMEOUT_MS`                                  |
| Новый slug, ключ публичного subpath      | `kebab-case`: `git-connections`, `server/git-connections`                                          |
| CSS Modules / собственный глобальный CSS | `camelCase`: `statusBadge` / `kebab-case` с владельцем: `git-connection-status`                    |

`const` сам по себе не требует `UPPER_SNAKE_CASE`: функции, компоненты,
конфигурации и вычисленные значения сохраняют формат своей роли.
Используй `Id`, `Url`, `Api`, `Dto` внутри составных имён, сохраняй написание
брендов (`GitHub`, `PostgreSQL`, `Payload`, `Next`) и внешних идентификаторов.
Суффиксы `Props`, `Options`, `Input`, `Result`, `Dto`, `Repository`, `Adapter`,
`Service`, `Error` должны описывать реальный контракт.

Функция называется по действию (`find`, `load`, `resolve`, `parse`, `validate`,
`map`, `normalize`, `format`, `create`, `update`, `delete`) и соответствует ему:
`formatSlug` не выполняет запрос, `mapConnection` не записывает в БД.
Не добавляй `Async` механически. Массивы — во множественном числе (`connections`),
одиночные значения — в единственном (`connection`); обозначай единицы и время
(`timeoutMs`, `sizeBytes`, `expiresAt`). Избегай `data`, `manager`, `processor`,
`temp`, `new`, `old`, `v2`, когда они скрывают назначение или историю правки.

## Исключения и переименование

Сохраняй обязательные имена и синтаксис инструментов:

- Next.js: `page.tsx`, `layout.tsx`, `route.ts`, metadata-файлы и остальные
  имена установленной версии; каталоги `[id]`, `[...slug]`, `(group)`, `@slot`, `_private`.
- Конфигурация: `package.json`, lockfiles, `tsconfig.json`, `next.config.*`,
  `vitest.config.*`, `eslint.config.*`; форматы рабочего слоя и документации:
  `AGENTS.md`, `README.md`, `SKILL.md`, `INDEX.md`, `RULE-*.md`.
- Окончания `.module.css` и `.d.ts`; имена генератора, поставщика и формата
  для генерируемых, сторонних и бинарных файлов; классы Tailwind и библиотек.
- Тесты: имя проверяемого владельца и суффикс текущего инструмента, например
  `resolveConnection.service.int.spec.ts` в `tests/int/`, `.e2e.spec.ts`
  для E2E, `.test.ts` для локального Git-инструмента. Обнаружение тестов сохраняется.

Исключение подтверждай конфигурацией или документацией инструмента. Размер
файла, внутреннее назначение и роль конфигурации не разрешают произвольное имя.
Существующие публичные имена API, БД, маршрутов и package exports сохраняй до отдельной
совместимой миграции; несовместимость не устраняй попутным переименованием.

При переименовании обновляй импорты, экспорты, источники Payload import map и
ссылки по [правилу очистки](../scope-control/RULE-STALE-ARTIFACT-CLEANUP-AFTER-REFACTOR.md),
шапки — по [правилу комментариев](RULE-CODE-COMMENT-DISCIPLINE.md).
Генерируемые файлы обновляй генератором. Изменение только регистра также
считается переименованием и проверяется с учётом файловой системы.
