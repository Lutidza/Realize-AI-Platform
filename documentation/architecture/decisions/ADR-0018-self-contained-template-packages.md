# ADR-0018: Самодостаточные шаблонные пакеты и единый lifecycle

## Статус

`accepted-as-target`, 2026-10-12. Пользователь разрешил документировать решение
и начать SDK, Realize package и host. Второй source этап добавляет compiled
каталог и постоянные prepare/preview/apply/recover назначения. Третий source
этап добавляет отдельный выбор native/template, его CAS/replay и переходы
между root layouts. Четвёртый этап доставил этот срез и read-only inventory в
основную локальную установку после M32-only применения и live приёмки.
Общий installer нового кода, frontend renderer и выпуск пакетов из Мастерской остаются отдельными этапами. Решение дополняет
[ADR-0014](ADR-0014-universal-site-core-and-project-profiles.md) и сохраняет
[существующие границы доставки](ADR-0009-delivery-platform.md).

## Контекст

Платформа должна создавать шаблоны через Мастерскую, устанавливать и заменять
их из Admin. Шаблон меняет всю композицию поддержанных экранов и может иметь
свои настройки, палитры, assets и UI-примитивы. Встроенного CSS preset или
отдельной custom view недостаточно для этого контрактного результата.

UI-kit владеет reusable primitives и runtime adapter; конкретный Admin renderer
сосредоточен в `packages/template-realize`. Serializable SDK отделён от React
presentation API, а appearance storage/API — в `packages/payload-extension-manager`. Сохранённая Workshop revision не является автоматически собранным,
установленным либо активным пакетом. Бизнес-данные, API и права принадлежат host
и модулям и не переходят к поставщику визуального шаблона.

## Решение

1. **Одна семья контрактов.** Независимый от Payload/AI Template SDK владеет
   serializable manifest/settings/token contracts и React presentation/UI API.
   Admin/frontend используют различимые targets/screens с одним protocol и
   lifecycle; активация поверхностей независима. Manifest, package, SDK и settings
   schema имеют отдельные версии. Полный продуктовый контракт находится в
   [§11 Мастерской](../../specifications/design-workshop.md#111-единый-контракт-самодостаточного-шаблона).

2. **Самодостаточная реализация.** Каждый template — отдельный package owner:
   public exports, полный renderer, settings, palettes, assets и primitive
   implementations. SDK стандартизирует публичное поведение и совместимость;
   внутреннее дерево пакета свободно. Preset содержит данные для совместимого
   установленного пакета и не устанавливает новый React-код.

3. **Явный UI adapter.** Модули разрешают активные primitive slots через стабильный
   provider/host contract. Публичные props/ref/events/accessibility совместимы;
   private components свободны. Fallback inheritance объявляется в manifest;
   отсутствие обязательных slots блокирует activation. Module-view overrides
   имеют собственные versioned presentation contracts, без замены backend/ACL.

4. **Односторонние зависимости.** `packages/template-contracts` — SDK,
   `packages/ui-kit` — общие primitives/runtime/fallback,
   `packages/template-realize` — первая реализация для Admin. UI-kit → SDK;
   Realize → UI-kit/SDK; host → их public exports. SDK/UI-kit не импортируют
   concrete template. Реализация System Admin переносится одним владельцем
   в `packages/template-realize/src/layouts/admin/`; старые внутренние пути
   выводятся после перевода consumers, без копий или обратного re-export фасада.
   Public renderer entry — `@realize/template-realize/admin`, составные
   SystemAdmin components — `@realize/template-realize/ui`.

5. **Host и module state.** Routes/session/ACL, доступные capabilities, appearance
   selection и сохранение settings остаются у host. Server snapshot сериализуем;
   callbacks/presentation строятся client host. React/Next App Router и SSR
   сохраняются, Client Components обновляются реактивно. Controllers вне
   заменяемого renderer сохраняют draft, frozen input/revision, pending UUID и
   known/unknown outcome; retry не создаёт новую команду. До этой границы switch
   при dirty/pending блокируется. Effective UI/palette/mode передаются portals.

6. **Один installer.** Общий менеджер расширений потребляет тот же manifest и
   существующий execution/release adapter. Install включает exact package/
   lockfile/registration в проверенный build; лишь runtime подтверждает
   установленную версию. Activation назначает совместимый package/preset/mode
   и settings revision target-у с CAS/receipt. Preview не меняет рабочее назначение.
   Update/replace/uninstall/recovery проверяют dependents, settings и доступность
   предыдущей версии. Новый compiled React-код требует build/delivery; production
   HTTP не запускает npm install. Выбор уже включённых в build совместимых
   пакетов может выполняться без пересборки.

7. **Мастерская — producer.** Starter/fork точной версии → DesignProject/revision →
   preview/checks → принятая revision → immutable DesignPackage → общий каталог →
   тот же install/activation lifecycle. Source revision/evidence/digest/build/
   receipt связаны, Workshop revision не равна Git commit. Стандартный пакет от
   другого поставщика проходит те же допуски. Отдельного Workshop installer,
   scheduler или Git/deploy engine не появляется.

8. **Самостоятельный Admin document.** Payload REST/GraphQL/session/ACL сохраняют
   существующих владельцев. Custom Views/Components и CSS поддерживают изменение
   native Admin, но отказ от DefaultTemplate не исключает Payload RootLayout/CSS.
   Собственная композиция без этих стилей использует отдельный root/host и
   проверенные backend adapters. Native editors переводятся с проверкой их
   необходимых функций; одна перенесённая страница не означает полной замены UI.

9. **Штатный Payload как встроенный вариант.** Выбор интерфейса Admin включает
   штатную оболочку Payload и пакетную оболочку, начиная с Realize. Для этого
   выбора второй собственный template package не требуется. Штатный UI не
   копируется и не форкается: его версия следует установленной версии CMS при
   штатном обновлении согласованных Payload-зависимостей. Realize имеет собственную
   версию и проверяемую совместимость с CMS. Дополнительные пакеты остаются
   расширением каталога, а не условием первого переключения.

   Host владеет выбором оболочки, её доступностью для конкретной установки,
   основным входом и переходом между root layouts. Native UI не объявляется
   готовым Renderer SDK и не получает фиктивный manifest/palette. Неиспользование
   native Admin не отключает backend/API. Клиент может работать только в Realize;
   доступ к штатной оболочке и возможность возврата определяются host policy.
   Текущая зависимость Realize от native login/unauthorized должна быть закрыта
   самостоятельным auth UI до полного отключения этих страниц.

   Appearance store хранит custom package assignment. Отдельный source shell
   store использует scope `${scopeKey}:admin-shell`, schema `1.0` и domain
   `admin-shell` в тех же private collections через строгий codec; appearance
   JSON и ledger не переписываются. Switch сохраняет custom настройки для
   возврата и независимый reference preset. Смена root выполняется явным
   переходом; drafts и frozen pending команды остаются в открытом controller.
   Первая пара Payload `3.88.0` ↔ Realize `0.1.0` установлена и прошла live
   switch/recover/replay приёмку. Это не installer нового кода.

## Следствия и приёмка

Первый срез имеет package `0.1.0`, manifest protocol `1.0`, settings schema
`1.0.0` и Admin renderer. Button/Input предоставляются активным adapter;
прочие действующие controls наследуют объявленный default. Поддержка frontend
target в SDK не подтверждает готовый storefront renderer.

Обязательная проверка SDK заменяемости: второй fixture renderer через тот же API
меняет композицию и primitives; реальные modules не импортируют конкретный
шаблон. Reference preset фиксируется отдельно от appearance установки.
Fixture не означает необходимость второго продуктового пакета: штатный Payload
и Realize уже задают два требуемых варианта Admin. Их переключение проверяется
отдельно по host policy, маршрутам, auth, изоляции CSS и сохранности данных.
Проверяются SSR/hydration, palette/mode/portals, keyboard/focus, 1440/768/390
и сохранность drafts/pending команд. Пакет проверяется на двух совместимых
hosts без копирования исходников в app.

Первый source срез реализован и прошёл contract/runtime tests, production build,
component browser checks и static Next SSR/CSS comparison. Исправлена зависимость
геометрии от порядка CSS chunks; обычные foundation правила Button/Input имеют
низкую specificity, а состояния сохраняют явные selectors. Этот результат ещё
не закрывает полную приёмку: нужны две совместимые установки и последующие
installer/Workshop этапы. Доставленный четвёртый срез проверяет защищённый
`/system/appearance`, native `/admin`, `/system` и actor previews; проверка каждого
остального экрана остаётся адресной.
Повторная source/installed reference сверка подтверждает прежнюю композицию;
для golden pixel comparison нужно одинаковое окружение Chromium и завершение CSS transitions.

Второй source этап проверяет каталог, actor-bound immutable планы, ACL/CAS,
неизменяемый lifetime UUID ledger, реальный PostgreSQL rollback и восстановление
предыдущего compiled назначения. Standalone экран сохраняет drafts/pending
операции при потере ответа и не подменяет renderer открытой страницы. Source
миграция проверена отдельно. Четвёртый этап применил только M32 к основной БД,
сохранил прежние 29 migration receipts и переключил существующую службу на V2.
14 live checks подтверждают inventory, session/roles, настройки через preview без
apply, а также shell apply/recover/replay; границы описаны в
[менеджере расширений](../../specifications/extension-management.md#раздел-установленных-шаблонов).

Installer принимается отдельно по фактическому install/update/replace/recovery,
runtime version и receipts. Workshop producer — по созданию/выпуску/установке
одной revision/digest. Текущий virtual file snapshot не содержит package metadata,
его нельзя объявлять готовым dependency artifact. Preview runtime должен
поддержать pinned SDK/UI dependencies до приёмки package preview.

Source/refactor/SDK проверки не разрешают Git delivery, изменение основной БД
или переключение службы. Эти действия выполняются по действующим разрешениям
сессии и профильным workflows.

## Связанные источники

- [Мастерская: package contract и producer](../../specifications/design-workshop.md#111-единый-контракт-самодостаточного-шаблона)
- [Менеджер расширений: единый installer lifecycle](../../specifications/extension-management.md)
- [UI-kit и публичные границы](../ui-kit.md)
- [THEME-14: шаблон через Мастерскую](../../product-functional-catalog.md#20-темы-дизайн-система-и-шаблоны)
- [Payload: Custom Views](https://payloadcms.com/docs/custom-components/custom-views)
- [Payload RootLayout v3.88.0](https://github.com/payloadcms/payload/blob/v3.88.0/packages/next/src/layouts/Root/index.tsx)
