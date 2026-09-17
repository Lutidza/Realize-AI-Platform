/**
 * @file src/components/admin/media/reference/mediaReference.fixtures.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Демонстрационные материалы, параметры, партии и источники.
 * @see documentation/specifications/media-management-references.md
 */

import type {
  Asset,
  LibraryContext,
  ProcessingRow,
  Profile,
  Purpose,
  Scenario,
  Section,
} from "./MediaReference.types";

export const sections: { id: Section; label: string }[] = [
  { id: "library", label: "Библиотека" },
  { id: "upload", label: "Добавление" },
  { id: "profiles", label: "Профили" },
  { id: "processing", label: "Обработка" },
  { id: "block", label: "Использование в блоке" },
  { id: "sources", label: "Источники" },
];
export const scenarios: { id: Scenario; label: string }[] = [
  { id: "normal", label: "Обычное" },
  { id: "empty", label: "Пустое" },
  { id: "loading", label: "Загрузка" },
  { id: "error", label: "Ошибка" },
  { id: "denied", label: "Нет прав" },
];
export const purposes: Purpose[] = ["Фото товара", "Баннер", "Контент"];
export const folders = ["Все материалы", "Товары", "Баннеры", "Контент"];
const names = [
  "Керамическая посуда",
  "Наушники Nova",
  "Лампа Aura",
  "Рюкзак Metro",
  "Термокружка Daily",
  "Худи Core",
  "Сыворотка Glow",
];
// Эти публичные изображения проверены host-интегратором; записи остаются примерами.
const imageURLs = [
  "/media/ceramic-table-set.png",
  "/media/nova-wireless-headphones.png",
  "/media/aura-smart-lamp.png",
  "/media/metro-backpack.png",
  "/media/daily-thermal-cup.png",
  "/media/core-cotton-hoodie.png",
  "/media/glow-serum.png",
];
export const demoAssets: Asset[] = [
  ...Array.from({ length: 25 }, (_, index): Asset => ({
    id: `demo-${index + 1}`,
    name: `${names[index % names.length]} — ${index === 0 ? "демонстрационное изображение коллекции с очень длинным полным названием для проверки переноса текста" : "пример " + (index + 1)}.jpg`,
    kind: "image",
    purpose: purposes[index % 3],
    folder: folders[(index % 3) + 1],
    url: imageURLs[index % imageURLs.length],
    date: `2026-09-${String((index % 14) + 1).padStart(2, "0")}`,
    alt: index % 4 === 0 ? "" : names[index % names.length],
    caption: "",
  })),
  {
    id: "demo-document",
    name: "Каталог — пример.pdf",
    kind: "other",
    purpose: "Контент",
    folder: "Контент",
    date: "2026-09-01",
    alt: "",
    caption: "",
  },
];
export const defaultLibrary: LibraryContext = {
  search: "",
  kind: "",
  purpose: "",
  folder: "Все материалы",
  sort: "new",
  view: "grid",
  page: 1,
};
export const demoProfiles: Record<Purpose, Profile> = {
  "Фото товара": {
    small: { width: "320", quality: "80", format: "WebP" },
    medium: { width: "800", quality: "85", format: "WebP" },
    large: { width: "1600", quality: "90", format: "JPEG" },
  },
  Баннер: {
    small: { width: "640", quality: "80", format: "AVIF" },
    medium: { width: "1280", quality: "85", format: "WebP" },
    large: { width: "1920", quality: "90", format: "JPEG" },
  },
  Контент: {
    small: { width: "320", quality: "75", format: "WebP" },
    medium: { width: "720", quality: "80", format: "WebP" },
    large: { width: "1440", quality: "85", format: "JPEG" },
  },
};
export const demoProcessing: ProcessingRow[] = [
  {
    id: "job-1",
    name: "Керамическая посуда.jpg",
    batch: "Товары — пример партии",
    status: "Готово",
  },
  {
    id: "job-2",
    name: "Наушники Nova.jpg",
    batch: "Товары — пример партии",
    status: "Ошибка",
  },
  {
    id: "job-3",
    name: "Лампа Aura.jpg",
    batch: "Контент — пример партии",
    status: "В очереди",
  },
];
export const sources = [
  {
    url: "https://www.sanity.io/docs/user-guides/interface",
    title: "Sanity",
    text: "Навигация, материалы и сведения, выбор файлов плюс drop; папки остаются демонстрационными.",
  },
  {
    url: "https://cloudinary.com/documentation/dam_manage_individual_assets",
    title: "Cloudinary",
    text: "Сетка, список, вкладки деталей; без стороннего DAM и переноса палитры.",
  },
  {
    url: "https://help.shopify.com/en/manual/shopify-admin/productivity-tools/file-uploads",
    title: "Shopify",
    text: "Поиск и фильтры в выборе из редактора; без чужих лимитов.",
  },
  {
    url: "https://payloadcms.com/docs/upload/overview",
    title: "Payload",
    text: "Штатный Upload владеет будущей рабочей загрузкой; макет ничего не отправляет.",
  },
];
