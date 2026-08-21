# 9. Интерфейс AI в Payload Admin

## 9.1. Основной экран

Custom View `/admin/ai` содержит три области.

### Левая колонка

- список диалогов;
- фильтр по статусам;
- поиск;
- активные изменения;
- ожидающие approval;
- последние deployments.

### Центральная колонка

- сообщения;
- streaming output;
- tool summaries;
- карточки планов;
- diff summaries;
- test results;
- preview links;
- ошибки и blockers;
- кнопка отмены run.

### Правая колонка

- текущий Change Request;
- тип изменения;
- риск;
- затронутые сущности и файлы;
- текущий state;
- approvals;
- estimated/actual usage;
- checks;
- preview;
- release artifact digest;
- rollback point.

## 9.2. Типы сообщений

```text
user_message
assistant_message
clarification
plan
scope_manifest
risk_notice
tool_activity_summary
data_diff
code_diff
check_result
approval_request
approval_decision
preview_ready
deployment_status
rollback_status
usage_notice
system_error
```

## 9.3. Кнопки управления

В зависимости от прав и state:

- «Уточнить запрос»;
- «Подтвердить план»;
- «Отклонить план»;
- «Запустить изменение»;
- «Остановить»;
- «Повторить проверку»;
- «Открыть preview»;
- «Принять результат»;
- «Опубликовать»;
- «Откатить»;
- «Передать специалисту агентства».

## 9.4. Контекстные действия

На странице редактирования товара/страницы можно добавить действие:

- «Обсудить с AI»;
- «Исправить этот документ»;
- «Объяснить, почему не публикуется»;
- «Создать похожий блок».

При этом `collection`, `documentID` и текущая version передаются сервером. Модель не выбирает произвольный документ через подмену UI payload.

## 9.5. UX-политика approvals

Approval не должен быть обычным «Да» в чате.

Подтверждение отображается отдельной карточкой с:

- точным действием;
- risk level;
- affected paths/documents;
- before/after summary;
- diff hash или operation hash;
- проверками;
- стоимостью/лимитом;
- сроком действия approval;
- кнопкой, доступной только авторизованной роли.

---

