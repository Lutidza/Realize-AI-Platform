# 7. Declarative-first

- **Статус:** target specification

## 7.1. Принцип

Повторяемая функция сайта сначала выражается декларативно: profile, module,
content type, block schema, component binding, theme token, integration
descriptor, capability adapter и check pack. Проектный код используется там,
где декларативной модели недостаточно.

Declarative-first не означает no-code и не запрещает агенту писать код. Он
уменьшает blast radius, упрощает preview, migration, policy и обновления ядра.

## 7.2. Владельцы

- Core registry определяет допустимые типы modules, capabilities и checks.
- Project profile выбирает и параметризует их для класса сайтов.
- Installation configuration активирует разрешённый набор для конкретного
  клиента.
- Custom code остаётся versioned source artifact и проходит Code Lane.

## 7.3. Правило выбора lane

1. Контент и существующая конфигурация — Data/Config Lane.
2. Изменение schema — Schema Lane с migration plan.
3. Сборка из зарегистрированных компонентов — Declarative UI Lane.
4. Новый компонент, plugin или нестандартная логика — Code Lane.
5. Смешанная задача — один parent Change Request с атомарно связанными
   subplans и общим acceptance.

Нельзя маскировать schema/code изменение как простую config mutation ради
снижения risk или обхода проверок.
