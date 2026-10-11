# Версии платформы и совместимость установки

- **Статус:** реализованный минимальный контракт PLAT-02.
- **Дата:** 11 октября 2026 года.
- **Цель:** [спецификация 40](../specifications/realize-ai-commerce/v1.0/01-architecture/40-platform-versioning-and-updates.md).

## Владельцы и версии

`@realize/ai-contracts/platform-release` содержит строгие DTO и validation;
`@realize/change-engine/platform-release` — проверки целостности, Git policy и
совместимости. `scripts/release` читает исходники и создаёт evidence. Entry points
исполняются Node.js 24.18.0 с установленными workspace dependencies, без loader.

Декларация находится в
[`platformRelease.config.json`](../../scripts/release/platformRelease.config.json).
Версии платформы и пакетов берутся из их `package.json`. Проверяются lockfile,
полный состав workspaces и точные внутренние зависимости. Версии остальных
единиц задаёт декларация. Это версии source contracts: существующие wire-форматы
`1.0` и `schemaVersion: 1` автоматически не перенумеровываются.

| Единица                                | Владелец изменений      | Идентичность                                                 |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| Платформа и пакеты                     | Владелец платформы      | Версия package, hashes файлов, source commit                 |
| Профиль, API, схема, compiler          | Владелец платформы      | Версия декларации и hash исходников                          |
| System runtime и схема админского слоя | Владелец платформы      | Раздельные source components и hashes                        |
| Рабочие `.ai`/`.codex`/`AGENTS.md`     | Владелец платформы      | Отдельный `development-instructions` component               |
| Quality pack и CI policy               | Владелец платформы      | Версии и hashes сценариев, fixtures, workflow, delivery-кода |
| Локальное расширение                   | Администратор установки | Собственные version/hash, extension point, exact зависимости |

Версии следуют [SemVer 2.0.0](https://semver.org/): изменение опубликованного
контракта получает новую версию по характеру совместимости. `@version` в шапке
исходника относится к файлу и не заменяет версию продукта. Текущие private
packages находятся в разработке; одинаковый номер на разных commit не означает
одинаковый артефакт. Изменение bytes обнаруживается по hash. Повторная публикация
другого содержимого под опубликованной immutable версией запрещена; контроль
истории в release registry относится к GIT-04.

Model Garden, Router и тарифные snapshots пока указаны как `unavailable`.
Каталог `model/list` Codex не объявляется Model Garden; provider adapter
версионируется отдельно. Неизвестная или пропущенная единица отклоняется.
Будущая возможность должна получить явную декларацию и реализацию.

## Source inventory и manifest

Компонент содержит `id`, `kind`, `owner`, `version`, `files[{path, sha256}]`
и `sha256` канонического списка файлов. Пути и компоненты сортируются; дубли
запрещены. Файлы читаются как данные, код проверяемого checkout не исполняется.
Путь разрешается в файл конкретного source commit, образ — в OCI digest.
Manifest не утверждает, что каждый исходник входит в образ: рабочие инструкции
и CI assets исключены из Docker context.

Охват задан декларацией. `node_modules`, caches, quarantined `src/RealizeCore`
и `src/app/_realize` исключены. Ignored `.codex/config.toml` не входит в поставку.
Symlinks, traversal, `.env`, PEM/key paths и превышение бюджета чтения
останавливают сборку inventory. Источник должен быть изолированным exact checkout;
локальная проверка dirty tree не подтверждает опубликованный commit.

Схема хранит миграции в порядке выполнения, прежний `migrationSetHash` и новый
`migrationOrderHash`. Перестановка обнаруживается при неизменном legacy set hash.
`recovery: separate-database-plan-required` не является планом отката БД.

`create-release-manifest.mjs` сохраняет прежние handoff-поля `gitSha`, `image`,
`imageDigest`, `releaseId`, `createdAt`, `schemaVersion: 1`. Полный контракт —
в `platform`:

- `source`: purpose/revision Git-подключения, repository ID, principal, commit и ref;
- `artifact`: immutable OCI reference/digest;
- `build`: workflow path/commit, GitHub run ID/attempt, provenance ref;
- `inventory`, `inventoryHash`: версии, исходники, схема, совместимость, support;
- `manifestHash`: hash канонического payload без самого `manifestHash`.

Workflow входит в CI component и имеет тот же commit, что и выпуск. `release.yml`
выпускает образ только из `main`; `packages: write` разрешено только image job.
Общие permissions — `contents: read`. Используется стандартный GitHub environment;
локальная подстановка env не доказывает происхождение сборки.

`prepare-release-candidate.yml` устанавливает зависимости из trusted checkout.
Candidate source читается без исполнения для `sourceInventory` и
`sourceInventoryHash` внутри существующего hashed manifest. Формат worker envelope
и прежние approval hashes сохраняются. `platformBase.status: unresolved`
обозначает отсутствие доказанной связи candidate с установленным upstream-ядром.
Customer commit не становится core commit. Привязка основы относится к PLAT-09.

## Git-назначения

`GitDeliveryBinding` не содержит credentials. Это снимок policy из доверенного
владельца конфигурации; prompt и клиентский Admin не являются таким источником.

| Назначение         | Authority / configuration owner       | Область                         |
| ------------------ | ------------------------------------- | ------------------------------- |
| `platform-core`    | `platform-owner` / `control-plane`    | Выпуск ядра владельцем          |
| `customer-project` | `installation-admin` / `installation` | Один проект указанной установки |

`assertGitDeliveryRequest` сверяет purpose, connection ID/revision, principal,
repository ID, installation ID, exact ref и отдельное действие. `read`,
`publish-source`, `publish-release`, `deploy` не подразумевают друг друга.
У ядра и клиента должны отличаться repository/principal/connection IDs.
URL и имя ветки не заменяют стабильную идентичность.

Подключён системный publisher текущего GitHub Actions lane:
`platform-core-actions`, revision `1`, `read`/`publish-release` на `refs/heads/main`.
Изменение policy требует новой revision и CI-проверки. Это не поле клиентской
админки. Центральное хранилище credentials, полная интеграция GIT-02/GIT-03 и
перевод SourcePromotion на контракт ещё предстоят. Development Git worker
не является этой продуктовой интеграцией.

## Совместимость установки

`InstalledPlatformState` различает `core` (manifest/hash/version/source commit/
base image digest) и `project` (клиентское Git-подключение, project commit, dirty
state). Отдельно передаются наблюдаемые component pins, `migrationOrderHash` и
локальные расширения. Автоматический сборщик состояния и persistence обновлений
относятся к PLAT-09.

`comparePlatformInstallation` проверяет выбранную основу. Разные core и customer
commits допустимы. Неизвестная основа, schema drift, dirty project, отсутствующие/
лишние компоненты и несовпадение version/hash получают issue codes. Компоненты
образуют одну разрешённую exact-комбинацию; совместимость соседней minor-версии
не предполагается. Результат не является планом перехода между двумя релизами.

Точка расширения `payload-ai-plugin-options@0.1.0` принадлежит публичному
`realizeAIPlugin(RealizeAIPluginOptions)` пакета `@realize/payload-ai-control`.
Расширение указывает собственный source hash, версию точки и exact зависимости,
обязательно включая пакет-владелец. Проверка metadata не заменяет тесты кода
расширения и не расширяет protected policy.

Support policy: `development`, `supported`, `deprecated`. Для внешнего клиента
`development` отклоняется; остальные состояния требуют `endsAt`. Deprecation
содержит дату объявления, причину, replacement version и HTTPS migration guide.
После `endsAt` сочетание отклоняется. Длительность коммерческой поддержки и срок
уведомления требуют решения до внешнего релиза; текущая декларация — `development`.

Проверка сохранённых наблюдений без изменения проекта; подставьте реальные пути
и заранее полученные доверенные значения в переменных:

```bash
node scripts/release/verifyPlatformInstallation.controller.mjs \
  /path/to/release-manifest.json /path/to/installed-state.json \
  "$TRUSTED_PLATFORM_MANIFEST_HASH" "$TRUSTED_PLATFORM_REPOSITORY_ID" development \
  /path/to/new-compatibility-evidence.json
```

Ожидаемые hash и repository ID приходят от доверенного владельца, не только из
проверяемого документа. CLI создаёт новый evidence-файл без перезаписи и выводит
тот же JSON. Exit codes: `0` — совместимость, `2` — несовместимость, `1` — ошибка
входа/целостности. Evidence содержит manifest/inventory/installed-state hashes,
время и причины отказа.

## Границы приёмки

Проверены strict contracts, native Node CLI, source/lock drift, Git-полномочия,
immutable hashes, порядок миграций, support и extension points. Внешние
GitHub/GHCR/VPS workflows при локальной проверке не запускались.

Hash подтверждает целостность; provenance ref — ссылка. Подпись, issuer,
актуальные ACL/revocation и достоверность observed state проверяются снаружи.
Совместимость не даёт deploy approval. `reusable-deploy.yml` ещё не вызывает
этот CLI и не получает production authorization от AI release gate.

Manifest сохраняется текущими GitHub artifacts (90 дней core, 30 candidate).
PLAT-03 добавил публикацию доверенного system AI artifact и точную привязку
chat/workflow/CR/executor к system/overlay snapshot; локальная приёмка и границы
описаны в [контракте AI-слоёв](../specifications/realize-ai-commerce/v1.0/01-architecture/10-ai-codex-layer-integration.md#1011-опубликованный-system-ai-release-и-исполнение).
PLAT-04 добавил installation-owned pricing snapshots и usage ledger. Версия
сборки не фиксирует тариф: каждый attempt сохраняет свой immutable pricing ID/hash.
Provider, infrastructure и customer estimates разделены; коммерческие списания
остаются будущим контуром. Долговечный registry и attestation binding —
GIT-04/PLAT-11; Garden/Router — PLAT-06/07; обновления/восстановление — PLAT-09;
закрытый центральный AI runtime — PLAT-10. Физический формат доставки ядра
не выбран.

Текущий локальный bundled system artifact — `realize-system-1.1.1`: PATCH
сохраняет инструкции и capabilities `1.1.0`, фиксируя актуальные source hashes
финансовых contracts, admission, metering и consumers. Его создание штатным
publisher не означает публикацию выпуска платформы или deployment.
`realize-system-1.1.0` и `realize-system-1.0.0` сохранены неизменными и явно
разрешены для прежних bindings. Registry проверяет
hash каждого bundled artifact; неизвестный ID/hash не получает fallback.
Сохранение прежней policy не восстанавливает старый бинарный runtime: новые
финансовые ограничения действуют также при продолжении исторического запуска.
Новые overlay releases компилируются с текущим system manifest. Возможность
продолжить старый запуск не означает совместимость старого overlay с новым.

Task Manager Foundation добавляет workspace package
`@realize/payload-task-manager@0.1.0`; schema component получает `1.2.0`
за добавочные таблицы, quality pack — `1.5.0` за новые contract/DB/browser
сценарии и охват source-header gate, delivery policy — `1.3.0` за task migration
template, изолированные acceptance CLI и Git handler с явным full-snapshot
разрешением. Quality pack включает его fixture tests, development instructions
получают `1.3.0` за синхронизированный контракт полного Git снимка.
Package/version/hash/revision задачи
остаются разными идентичностями. Эти development declarations вместе с
исходниками входят в следующий точный manifest; самостоятельного внешнего
релиза Foundation пока не создают.
