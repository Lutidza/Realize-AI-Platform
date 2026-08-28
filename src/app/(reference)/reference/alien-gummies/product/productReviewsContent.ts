/**
 * @file src/app/(reference)/reference/alien-gummies/product/productReviewsContent.ts
 * @version 2026-07-21
 * @description Route-private customer review records and summary distribution.
 */
import { productReferenceMedia as media } from "./productReferenceMedia";

export const ratingBars = [98, 9, 4, 2, 1] as const;

export const reviews = [
  {
    body: "Очень вкусно и легко помнить про ежедневную порцию. Стик сразу положила рядом с ключами.",
    city: "Москва",
    initials: "ВС",
    name: "Виктория С.",
    photo: media.lifestyle,
    product: "Йогуртовые ягоды / 28 стиков",
    rating: 5,
    time: "12 минут назад",
    title: "Отличный вкус и удобный формат",
  },
  {
    body: "Это пока самые приятные мармеладки из тех, что пробовала. Подписку настроила за пару минут.",
    city: "Санкт-Петербург",
    initials: "ММ",
    name: "Марина М.",
    product: "Малиновый лимонад / 28 стиков",
    rating: 5,
    time: "13 минут назад",
    title: "Буду заказывать снова",
  },
  {
    body: "Через пару недель привычка стала автоматической. Особенно нравится, что не нужен шейкер.",
    city: "Казань",
    initials: "АВ",
    name: "Алексей В.",
    product: "Йогуртовые ягоды / 28 стиков",
    rating: 5,
    time: "18 минут назад",
    title: "Легко встроить в день",
  },
  {
    body: "Новый вкус яркий, но не приторный. Беру с собой в офис и в дорогу.",
    city: "Екатеринбург",
    initials: "ИЕ",
    name: "Ирина Е.",
    product: "Малиновый лимонад / 28 стиков",
    rating: 5,
    time: "32 минуты назад",
    title: "Влюбилась во вкус",
  },
  {
    body: "Пользуюсь неделю и уже понимаю, что повторю заказ. Упаковка и индивидуальные стики очень удобные.",
    city: "Новосибирск",
    initials: "ЛВ",
    name: "Людмила В.",
    photo: media.reviews,
    product: "Йогуртовые ягоды / 28 стиков",
    rating: 5,
    time: "39 минут назад",
    title: "Точно повторю покупку",
  },
  {
    body: "Порции удобно брать на тренировку, а ягодный вкус не надоедает даже при ежедневном использовании.",
    city: "Самара",
    initials: "КП",
    name: "Кирилл П.",
    product: "Йогуртовые ягоды / 28 стиков",
    rating: 4,
    time: "48 минут назад",
    title: "Удобно брать с собой",
  },
  {
    body: "Заказ пришёл аккуратно упакованным. Малиновый лимонад оказался свежим и сбалансированным по сладости.",
    city: "Тула",
    initials: "ОК",
    name: "Ольга К.",
    photo: media.pouch,
    product: "Малиновый лимонад / 28 стиков",
    rating: 5,
    time: "1 час назад",
    title: "Яркий сезонный вкус",
  },
] as const;
