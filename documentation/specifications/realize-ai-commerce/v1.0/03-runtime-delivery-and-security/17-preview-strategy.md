# 17. Preview strategy

- **Статус:** target specification

## 17.1. Виды preview

- **Plan preview:** scope, operations, risk, cost и checks без side effect.
- **Data preview:** resolved targets, before/after projection и validation.
- **Code preview:** isolated commit, build и standalone site environment.
- **Release preview:** immutable OCI candidate в production-like изоляции.

Preview одного уровня не заменяет approval следующего.

## 17.2. Изоляция

Code/release preview создаётся из exact artifact, отдельной PostgreSQL и
sanitized data/media snapshot. Он получает собственный hostname/port, TTL,
authentication и network policy. Production secrets, платежные credentials,
PII и доступ к другим installations исключены.

Preview не использует основной checkout или production database. Cleanup
удаляет environment и volumes по TTL, сохраняя bounded audit/evidence.

## 17.3. Проверки

Server-owned core checks включают readiness, rendered page, broken assets,
console/runtime errors и security headers. Project profile добавляет собственные
маршруты и бизнес-сценарии: e-commerce может проверять catalog/cart/checkout,
а content profile — публикацию, navigation и forms.

`PREVIEW_ACCEPTANCE` связывается с commit/digest, database snapshot hash,
configuration release, check results и URL evidence. Пересборка или изменение
данных требует нового решения.
