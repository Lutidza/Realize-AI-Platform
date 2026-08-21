# Этап 0H. Минимальный реальный test suite

Создай тесты, проверяющие не только наличие файлов.

Минимум:

## Integration

- Payload config инициализируется;
- подключение к тестовой PostgreSQL;
- базовый admin/auth access;
- Products/Categories доступны в ожидаемой конфигурации;
- опубликованные/черновые данные соблюдают access contract;
- запрещённая операция не проходит;
- ключевые globals загружаются.

## E2E/smoke

- storefront открывается;
- значимая страница каталога открывается;
- product page открывается при seeded product;
- Payload admin login view открывается;
- базовый cart flow работает без реального платежа;
- checkout не вызывает реальный Stripe;
- критическая console/page error фиксируется как failure.

Тесты должны быть детерминированными, с локальным seed и без внешней оплаты.

