# Payload Extension Manager

Внутренний пакет `@realize/payload-extension-manager@0.1.0` подключает compiled
каталог шаблонов и постоянные назначения Admin/frontend. Host предоставляет
auth collection, scope, проверенный registry, default assignments и отдельные
access callbacks для чтения, смены оформления и установки кода.

`extensionManagerPlugin(options)` сохраняет существующую Payload config и
добавляет закрытые collections и endpoints. `/contracts` содержит только
serializable типы, schemas и DTO mappers; `/server` — native Payload facade,
transactional repository и server resolver. Browser не импортирует `/server`.

Смена оформления: подготовка immutable плана → actor-bound предпросмотр →
явное применение по hash и ожидаемой revision → immutable receipt. Запросы
prepare/apply используют canonical lowercase UUID в `Idempotency-Key`;
повтор с тем же actor/key/body возвращает первоначальный результат. Recover
готовит обычный план для предыдущего совместимого назначения.

Исходный reader от 18 ноября поддерживает optional `ExtensionAssignment.layout`
с точной reference и hash каталога макетов. Общая assignment schema сохраняет
binding в plans/receipts, appearance codec и nested Admin-shell DTO. При наличии
binding явный `settings.layoutId` обязан совпасть с его localId; отсутствие key
сохраняет наследование. Без binding старые settings не интерпретируются заново.
Отсутствующее поле не добавляется в исторические JSON/hashes. Reader проверяет
форму, а не существование reference или доступность renderer.

Второй source-срез подключает trusted `registration.layouts` с явным mapping
`templateIdentity` и проверенным catalog. Compiled entry/DTO получают
`layoutCatalog`; его hash входит в appearance catalog hash. Pure resolver/prepare
формируют exact binding, сохраняя отсутствие наследуемого settings.layoutId.
Legacy записи без layouts сохраняют прежнюю форму и manifest hash.

Durable запись нового формата закрыта: server operation policy
`layoutAssignmentWrites` по умолчанию `disabled`; HTTP input её не задаёт.
Appearance и Admin Shell prepare/apply проверяют весь возвращаемый store,
включая bootstrap/history, после replay и до persistence. Ошибка —
`LAYOUT_BINDING_WRITES_DISABLED`, без сохранения неполного legacy плана.
Только pure fixtures явно разрешают `enabled`; реальные services передают
`disabled`. До включения записи нужно доставить совместимые readers и определить
минимально совместимую сборку отката: старый strict codec не прочтёт новые
pending plans/receipts. Source-код не обновляет установленную службу или БД.

Хранилище требует source migration host-проекта. В Realize это
`20261012_094626_extension_manager_state`: отдельные state и lifetime receipt
таблицы, SQL immutability и запрет rollback при наличии записей. Отсутствие
таблиц явно возвращается как `requires_schema`; чтение каталога остаётся доступным.

Установка нового кода пока возвращает `DELIVERY_ADAPTER_UNAVAILABLE` до создания
job. Пакет не исполняет npm, build или deployment внутри HTTP. Frontend renderer
в текущей сборке Realize отсутствует. Мастерская и выпуск package artifacts
подключаются отдельным этапом через существующие delivery owners.

Реальную migration/transaction acceptance в собственной временной PostgreSQL
базе запускает `npm run check:extensions:postgres` из корня проекта. Controller
не открывает рабочую БД и удаляет только созданную им fixture.

Полный контракт: [extension-management](../../documentation/specifications/extension-management.md).
