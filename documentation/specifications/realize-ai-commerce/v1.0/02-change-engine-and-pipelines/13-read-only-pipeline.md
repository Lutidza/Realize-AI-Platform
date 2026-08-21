# 13. Pipeline: read-only запрос

## 13.1. Цель

Ответить на вопрос о проекте или данных без side effects.

## 13.2. Этапы

1. Authenticate user.
2. Resolve installation context server-side.
3. Resolve permissions.
4. Classify as QUERY.
5. Apply read scope.
6. Compile Context Pack.
7. Запустить Codex thread в `read-only` sandbox.
8. Разрешить только read tools.
9. Получить tool summaries и final response.
10. Записать run usage.
11. Сохранить assistant message.
12. Закрыть run.

## 13.3. Ограничения

- нет Git write;
- нет Payload update/create/delete;
- нет shell с network;
- нет secrets;
- нет raw production dumps;
- read query обязан использовать минимальный `select`;
- orders/users fields маскируются;
- результат маркируется источниками проекта/документов.

---

