# 35. Примеры прохождения pipeline

## 35.1. «Перенеси товары из одной категории в другую»

```text
User message
-> classify CATALOG_CHANGE / R2
-> read matching products
-> build typed operation plan
-> dry-run
-> show 83 affected products
-> user approves operation hash
-> transaction
-> verify 83 products
-> update search/index hooks
-> show result
-> close
```

Ни build, ни code deploy не нужны.

## 35.2. «Сделай карточки товаров компактнее»

```text
User message
-> classify THEME_CHANGE
-> inspect Module Registry + Theme Contract
-> propose token/config change
-> preview draft/config
-> approve
-> apply config
-> verify responsive UI
-> close
```

Если tokens недостаточно:

```text
-> escalate CODE_CHANGE / R3
-> scope plan
-> worktree
-> implementation
-> tests
-> preview image
-> acceptance
-> signed release
-> production deploy
```

## 35.3. «Добавь новый фильтр по материалу»

Возможные ветки:

- если attribute/filter infrastructure уже поддерживает материал — config/data lane;
- если нужен новый schema field/index — mixed R3;
- если запрос затрагивает общий search core — Agency Engineering Request.

## 35.4. «Посмотри в базе, почему товар не виден»

```text
QUERY / R0
-> read product with safe select
-> inspect status/category/stock/access/index projection
-> explain diagnosis
-> optionally offer Change Request
```

Диагностический запрос сам ничего не исправляет.

## 35.5. «Опубликуй всё сразу»

Запрос недостаточно безопасен.

Система должна:

- определить точный scope;
- показать count;
- исключить protected content;
- создать bulk plan;
- потребовать approval;
- не выполнять неопределённую команду напрямую.

---

