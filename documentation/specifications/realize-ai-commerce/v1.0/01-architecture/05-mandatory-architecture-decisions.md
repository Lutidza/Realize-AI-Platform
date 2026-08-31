# 5. Обязательные архитектурные решения

- **Статус:** target specification
- **Канонические решения:** [Architecture Decision Log](../../../../architecture/decisions/INDEX.md)

Эта глава не вводит параллельную нумерацию ADR. Нормативны ADR-0001 и
последующие записи из общего журнала.

## 5.1. Неподвижные решения V1

1. Одна клиентская инсталляция обслуживает одного клиента и имеет отдельную
   PostgreSQL, secrets, media и source/release history.
2. Универсальное платформенное ядро отделено от проектных профилей;
   e-commerce — первый промышленный профиль.
3. Browser и модель не получают прямой доступ к OpenAI credential, raw Payload
   CRUD, SQL, shell, Docker socket или production credentials.
4. Любая мутация проходит через Change Engine и server-owned executors.
5. Системный AI-layer защищён; Admin управляет только отдельным installation
   overlay.
6. Security policy, protected scopes и license entitlements являются ceilings:
   нижний слой не может их расширить.
7. Plan, implementation, preview, release и production transition являются
   разными hash-bound решениями, когда этого требует risk.
8. Код выполняется в изолированном workspace; production deploy использует
   проверенный immutable artifact по exact digest.
9. Schema меняется versioned миграциями. Database rollback не подменяется
   application rollback.
10. Публичный сайт и доступ владельца к данным не должны зависеть от краткого
    сбоя license/control-plane.

## 5.2. Изменение решений

Отступление требует нового ADR с контекстом, последствиями и migration path.
Редактирование старого ADR задним числом запрещено.
