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
