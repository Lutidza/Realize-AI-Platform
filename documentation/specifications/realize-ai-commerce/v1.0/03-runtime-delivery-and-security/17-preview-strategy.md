# 17. Preview strategy

- **Статус:** target specification

## 17.1. Виды preview

- **Plan preview:** scope, operations, risk, cost и checks без side effect.
- **Data preview:** resolved targets, before/after projection и validation.
- **CMS draft preview:** штатный Live Preview Payload для актуального сохранённого
  draft Pages через renderer приложения; первый реализованный срез описан в 17.4.
- **Code preview:** isolated commit, build и standalone site environment.
- **Release preview:** immutable OCI candidate в production-like изоляции.

Preview одного уровня не заменяет approval следующего.

## 17.2. Изоляция

Code/release preview создаётся из exact artifact, отдельной PostgreSQL и
sanitized data/media snapshot. Он получает собственный hostname/port, TTL,
authentication и network policy. Production secrets, платежные credentials,
PII и доступ к другим installations исключены.

Code/release preview не использует основной checkout или production database. Cleanup
удаляет environment и volumes по TTL, сохраняя bounded audit/evidence.

## 17.3. Проверки

Server-owned core checks включают readiness, rendered page, broken assets,
console/runtime errors и security headers. Project profile добавляет собственные
маршруты и бизнес-сценарии: e-commerce может проверять catalog/cart/checkout,
а content profile — публикацию, navigation и forms.

`PREVIEW_ACCEPTANCE` связывается с commit/digest, database snapshot hash,
configuration release, check results и URL evidence. Пересборка или изменение
данных требует нового решения.

## 17.4. Штатный Live Preview CMS

Pages использует существующие admin.livePreview и admin.preview Payload.
Встроенный интерфейс предоставляет iframe, переключатель, открытие новой вкладки,
размеры и zoom. URL формирует generatePreviewPath; /next/preview проверяет
PREVIEW_SECRET, admin-сессию и безопасный внутренний путь перед draftMode.
Чтение Pages и metadata повторно применяет текущую авторизацию и ACL.
RefreshRouteOnSave обновляет сохранённый draft после обычного save или autosave.

Это предпросмотр текущей установки и актуального сохранённого draft, а не
изолированный code/release environment и не закреплённая ревизия. Используются
обычные renderer и поведение блоков сайта. Поддержка блока в Live Preview не
означает, что публикационный сервис агента уже умеет безопасно его публиковать.
Дополнительный visual-preview route, token операции и отдельная preview-панель
не поддерживаются.

Next development logging исключает вход /next/preview с query секрета.
Reverse proxy и внешняя телеметрия также не должны сохранять этот query.
Native preview URL не помещают в отчёты и снимки адресной строки. Стандартные
ограничения draftMode и dev cache остаются свойствами установленного Next;
эта интеграция не вводит отдельной HTML cache policy.

Контракт — [14.12. Штатный Live Preview Payload](../02-change-engine-and-pipelines/14-data-config-pipeline.md#1412-штатный-live-preview-payload).

### От просмотра к подтверждению публикации

Сначала отдельная R2 DataOperation фиксирует source operation, текущую draft
revision, публичную версию, catalogHash и publication policy/checks. Карточка содержит
server-owned adminUrl обычного редактора и frontendPreviewUrl перехода к native
preview. Кнопки «Посмотреть в админке» и «Посмотреть на фронте» находятся вне
сворачиваемых подробностей. Переход по второй ссылке проверяет владельца операции
и Pages ACL, вызывает configured admin.preview и перенаправляет на его URL;
сам не включает draftMode и не отображает страницу. Секрет отсутствует в DTO.
Пользователь открывает Live Preview
и проверяет выбранное содержимое, затем явно отмечает desktop/mobile/noErrors
для manifest этого плана. Открытие ссылки не выставляет свидетельство просмотра.

Approve и apply повторно сравнивают source, revision, каталог и policy. Любое сохранение
после подготовки плана, включая autosave в редакторе, делает план устаревшим.
Старое подтверждение не переносится на новые данные. Свидетельство пользователя
не является автоматическим browser audit или PREVIEW_ACCEPTANCE code/release.

Первый публикационный сценарий поддерживает статические Content/Banner и
текстовый hero; ссылки, Media, формы и неизвестные зависимости его блокируют.
Общая оболочка остаётся текущей по явной policy. DB commit и обновление витрины
различаются в результате: повтор доставки не сохраняет страницу заново.
Полные гарантии и восстановление — [14.13](../02-change-engine-and-pipelines/14-data-config-pipeline.md#1413-публикация-и-восстановление-публичной-версии-pages).
