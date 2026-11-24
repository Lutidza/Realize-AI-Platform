# @realize/template-contracts

Версия SDK **0.1.0**, protocol **1.0**. Пакет владеет общим контрактом
самостоятельных Admin/frontend template packages; не зависит от Next, Payload,
AI runtime или внутренностей host.

Публичные входы:

- `@realize/template-contracts`: strict schemas, `parseTemplateManifest`,
  `resolveTemplateSelection`, DTO и `TemplateContractError`.
- `@realize/template-contracts/react`: только presentation/definition/primitive
  types. Этот вход не запускает React и не содержит renderer.
- `@realize/template-contracts/layouts/server`: синхронная сборка и проверка
  SHA-256 каталога макетов; Node-only вход, не импортируется renderer.

Manifest объявляет точные ID/version/packageName, target exports, screen IDs,
optional capabilities, compatibility bounds, settings schema/defaults,
palette ID/version/modes и public primitive slots. Неизвестные поля структуры,
небезопасные пути, повторные targets/palettes и несовместимые назначения
отклоняются. Target и его entry объявляются вместе.

Protocol 1.0 поддерживает только стабильные SemVer `x.y.z` с целочисленными
сегментами в безопасном диапазоне JavaScript. Prerelease, build metadata,
`latest` и произвольные ranges намеренно отклоняются. Compatibility использует
включительную `minimum` и исключительную `maximumExclusive`. Selector проверяет
точные template/palette версии, target, capabilities и mode; silent fallback нет.

`settings.schemaVersion` — отдельная stable SemVer, например `1.0.0`.
`settings.schemaPath` — относительный JSON-файл внутри пакета; `entries` —
публичные package subpaths, например `./admin`. SDK не читает эти файлы и не
выполняет их. Проверка defaults против JSON Schema принадлежит packager/host.
В defaults допустим bounded plain JSON: глубина до 32, до 4096 значений/узлов;
циклы, getters, Date, non-finite числа, sparse arrays и reserved prototype keys
отклоняются. Это parser limits, не storage quota.

React API различает Admin workspace/auth/status и frontend page. Host передаёт
проверенные settings, семантическую навигацию и необязательные группы
search/create/assistant/notifications/account. Content slot предназначен для
модуля. Фиктивные actor/navigation для login и готовая непрозрачная toolbar
не требуются. `TemplateUiAdapter` предоставляет Button/Input с native props,
ref и events; наследование default реализации явно объявляется manifest.

`TemplateDefinition` связывает manifest с compiled Renderer, UI adapter и
palettes. CSS принадлежит пакету; palette содержит className и modes, а не
произвольный URL/import. Идентичность/версии runtime definitions сверяет host.
Необязательные compiled `resolveSettings` и `getThemeStyle` проверяют частные
настройки и превращают их в style/tokens. Это детерминированные pure-функции
без доступа к backend; host применяет их результат также к portals. SDK не
исполняет JSON Schema и не импортирует пакет по имени из manifest.
Artifact digest хранится отдельно в installation/release receipt: исходный
manifest не содержит self-hash.

Корректный manifest не подтверждает доверие к коду, установку или готовность.
Installer/Workshop используют один контракт, но остаются владельцами своих
проверок, actor permissions, delivery, source/evidence и activation receipts.

Первый layout profile `realize.admin-panel-frame@0.1.0` имеет отдельную strict
schema. Root API экспортирует `parseLayoutDescriptor`, `parseTemplateLayoutCatalog`,
`resolveTemplateLayout` и `assertLayoutSlots`. Metadata описывают identity,
самостоятельную exact SemVer version, owner, template, runtime regions/slots и
owner-bound README guides. Это ограниченный Admin profile, не общий редактор
компонентов. Его версии могут содержать SemVer prerelease/build; manifest protocol
1.0 выше по-прежнему принимает только стабильные версии.

Каталог связывает template release, default alias и точные alias pins с
определениями. Отсутствующий layoutId наследует default; явный неизвестный alias
отклоняется. Parser нормализует, проверяет граф ссылок и замораживает metadata.
Для DTO с catalogHash он проверяет только формат hash. Server API
`createTemplateLayoutCatalog(input, expectedCatalogHash?)` пересчитывает hash и
отклоняет несовпадающий claimed hash или независимый устаревший expected hash.
Hash покрывает metadata/default/alias pins/template version, без bytes кода,
CSS, guides или артефакта установки; он не подтверждает ACL или доступность
runtime. Сравнение с expected hash само по себе не публикует определение.

Срез двух draft definitions и точные ограничения реализации описаны в
[спецификации Control Panel](../../documentation/specifications/realize-ai-control-panel-first-release.md#381-самостоятельные-определения-макетов-и-release-pins).

С 18 ноября первый reader назначения понимает `LayoutAssignmentBinding`:
`{schemaVersion:"1.0", localId, reference, catalogHash}`. Root API экспортирует
`layoutAssignmentBindingSchema` и `parseLayoutAssignmentBinding`; parser
проверяет bounded plain JSON и возвращает detached frozen snapshot. Неверная
форма отклоняется с `INVALID_LAYOUT_BINDING`. Проверяется только формат exact
reference/hash: существование в каталоге, target/profile, hash verification и
runtime admission принадлежат следующему этапу. Тип wire input также доступен
как `LayoutAssignmentBindingInput`. Новая схема не разрешает alias и не
подставляет default в settings.

Каноническое направление:
[Мастерская](../../documentation/specifications/design-workshop.md),
[менеджер расширений](../../documentation/specifications/extension-management.md).
