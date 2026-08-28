/**
 * @file src/app/(reference)/reference/alien-gummies/product/productBuyboxContent.ts
 * @version 2026-07-21
 * @description Static route-private content used by the Cosmo Gummy product buybox.
 */
import { productReferenceMedia as media } from "./productReferenceMedia";

export const galleryItems = [
  { alt: "Упаковка Cosmo Gummy", image: media.hero },
  { alt: "Этикетка состава Cosmo Gummy", image: media.nutrition },
  { alt: "Отзывы покупателей Cosmo Gummy", image: media.reviews },
  { alt: "Первые 30 дней с Cosmo Gummy", image: media.timeline },
  { alt: "Клинические показатели Cosmo Gummy", image: media.clinical },
  { alt: "Поддержка пищеварения и энергии", image: media.support },
] as const;

export const productBenefits = [
  "Поддерживает фокус и дневную энергию",
  "Поддерживает иммунитет и стресс-ответ",
  "Поддерживает пищеварение и микробиом",
  "Партии проверяются на заявленные нутриенты",
] as const;

export const flavorOptions = [
  { image: media.flavorOriginal, name: "Йогуртовые ягоды", selected: true },
  {
    badge: "Новинка",
    image: media.flavorRaspberry,
    name: "Малиновый лимонад",
    selected: false,
  },
] as const;

export const purchaseOptions = [
  {
    active: true,
    daily: "107 ₽/день",
    oldPrice: "3 990 ₽",
    perks: [
      "25% скидка на каждый заказ",
      "1 000 ₽ скидка на первый заказ",
      "Бесплатная доставка сегодня",
    ],
    price: "2 990 ₽",
    supply: "28 стиков / 4 недели",
    title: "Месячная доставка",
    value: "Самый популярный: экономия 1 000 ₽",
    valueTone: "popular",
  },
  {
    active: false,
    daily: "107 ₽/день",
    oldPrice: "11 970 ₽",
    perks: [],
    price: "8 970 ₽",
    supply: "84 стика / 12 недель",
    title: "Квартальная доставка",
    value: "Лучшая цена: экономия 3 000 ₽",
    valueTone: "deal",
  },
  {
    active: false,
    daily: "143 ₽/день",
    oldPrice: "4 490 ₽",
    perks: [],
    price: "3 990 ₽",
    supply: "28 стиков разово",
    title: "Разовая покупка",
    value: undefined,
    valueTone: undefined,
  },
] as const;

export const productDetails = [
  {
    content:
      "Один ежедневный стик объединяет витамины, минералы, клетчатку, ягоды и растительные нутриенты в формате мармеладок.",
    title: "Почему Cosmo Gummy?",
  },
  {
    content:
      "Без желатина и искусственных красителей. Аллергены, маркировка, декларации и срок годности доступны рядом с товаром.",
    title: "Состав и аллергены",
  },
  {
    content:
      "Каждая партия проверяется по нутриентам, тяжёлым металлам и микробиологическим показателям.",
    title: "Наука и сертификаты",
  },
  {
    content:
      "Одна упаковка в день. Доступны разовая покупка и подписка с регулярной доставкой по России.",
    title: "Как принимать",
  },
  {
    content:
      "Формула поддерживает энергетический обмен, пищеварение, иммунитет и ежедневную нутриентную привычку.",
    title: "Польза",
  },
] as const;

export const tasteNotes = [
  { icon: "🍃", text: "Свежий вкус" },
  { icon: "🫐", text: "Ягоды" },
  { icon: "🥛", text: "Йогурт" },
] as const;

export const packedWith = [
  { icon: "🥦", text: "Овощные суперфуды" },
  { icon: "🍇", text: "Фрукты и ягоды" },
  { icon: "💊", text: "Витамины и минералы" },
  { icon: "🧠", text: "Адаптогены" },
  { icon: "🌿", text: "Травы" },
  { icon: "🛡️", text: "Антиоксиданты" },
  { icon: "🦠", text: "Пребиотики" },
  { icon: "🍄", text: "Супергрибы" },
] as const;
