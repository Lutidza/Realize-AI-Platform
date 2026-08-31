# 35. Pipeline examples

- **Статус:** target examples, не закрытый каталог capabilities

## Контент

«Обнови первый экран корпоративного сайта». Content capability разрешает
страницу/поля, строит before/after preview, применяет R1/R2 mutation и сохраняет
rollback snapshot.

## Данные e-commerce

«Подними цены выбранной категории на 10%». Profile adapter разрешает selectors,
показывает exact товары и итоговые цены, применяет batch limits и transaction,
после approval сохраняет compensating snapshot.

## Schema

«Добавь тип контента “Кейсы”». Mixed Change создаёт schema/code migration,
admin/public UI, backfill strategy, tests и preview. Удаление старой schema
откладывается до совместимого следующего release.

## Дизайн и страница

«Создай посадочную страницу услуги». Declarative UI Lane использует
зарегистрированные blocks/tokens; недостающий компонент передаётся Code Lane.
Пользователь принимает rendered preview, а не только diff.

## Plugin

«Подключи формы к CRM». Code/integration lanes создают project plugin и
write-only integration settings. Credential вводит Admin и модель его не видит.

## Production

«Опубликуй одобренное изменение». Команда выбирает exact accepted preview,
готовит Release Candidate, получает release approval и отдельный production
authorization. Нельзя публиковать “последнюю версию” по mutable reference.
