/**
 * @file src/app/(reference)/reference/alien-gummies/product/ProductBuybox.tsx
 * @version 2026-07-21
 * @description Product gallery, options, subscription cards, trust details, and flavor profile.
 */
"use client";

import {
  CheckCircle2,
  RefreshCcw,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import {
  flavorOptions,
  galleryItems,
  packedWith,
  productBenefits,
  productDetails,
  tasteNotes,
} from "./productBuyboxContent";
import galleryStyles from "./ProductBuyboxGallery.module.css";
import optionStyles from "./ProductBuyboxOptions.module.css";
import profileStyles from "./ProductBuyboxProfile.module.css";
import purchaseStyles from "./ProductBuyboxPurchase.module.css";
import { ProductPurchaseOptions } from "./ProductPurchaseOptions";

const trustBadges = [
  { icon: ShieldCheck, text: "30 дней гарантии" },
  { icon: CheckCircle2, text: "Лабораторно проверено" },
  { icon: RefreshCcw, text: "Гибкая подписка" },
] as const;

/** Renders the complete route-private product selection and purchase surface. */
export function ProductBuybox() {
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [activeFlavorIndex, setActiveFlavorIndex] = useState(0);
  const [activePurchaseIndex, setActivePurchaseIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [sugar, setSugar] = useState<"Без сахара" | "Low Sugar">("Low Sugar");
  const activeGalleryItem = galleryItems[activeGalleryIndex];
  const activeFlavor = flavorOptions[activeFlavorIndex];

  return (
    <section className={galleryStyles.productShell}>
      <div className={galleryStyles.galleryColumn}>
        <div className={galleryStyles.galleryLayout}>
          <div
            aria-label="Галерея товара"
            className={galleryStyles.thumbnailRail}
          >
            {galleryItems.map((item, index) => (
              <button
                aria-label={`Открыть изображение ${index + 1}`}
                aria-pressed={index === activeGalleryIndex}
                className={
                  index === activeGalleryIndex
                    ? galleryStyles.thumbnailActive
                    : undefined
                }
                key={item.image}
                onClick={() => setActiveGalleryIndex(index)}
                type="button"
              >
                <Image
                  alt=""
                  height={100}
                  loading={index === 0 ? "eager" : "lazy"}
                  src={item.image}
                  unoptimized
                  width={100}
                />
              </button>
            ))}
          </div>
          <figure className={galleryStyles.heroMedia}>
            <Image
              alt={activeGalleryItem.alt}
              fetchPriority="high"
              height={1000}
              loading="eager"
              src={activeGalleryItem.image}
              unoptimized
              width={1000}
            />
          </figure>
        </div>
        <button
          className={galleryStyles.nutritionButton}
          onClick={() => setActiveGalleryIndex(1)}
          type="button"
        >
          Посмотреть состав
        </button>
        <div className={galleryStyles.labCard}>
          <span className={galleryStyles.labMark}>✓</span>
          <span>
            Проверено Light Labs <em>Февраль 2026</em>
          </span>
          <strong>35 показателей качества →</strong>
        </div>
      </div>

      <aside className={optionStyles.productPanel} id="purchase">
        <div className={optionStyles.rating}>
          <span aria-label="Рейтинг пять звёзд" className={optionStyles.stars}>
            {Array.from({ length: 5 }).map((_, index) => (
              <Star
                aria-hidden="true"
                fill="currentColor"
                key={index}
                size={18}
              />
            ))}
          </span>
          <span>4.9/5.0 (100 000), 1M+ покупателей</span>
        </div>
        <h1>Cosmo Gummy Superfood Gummies</h1>
        <p className={optionStyles.lead}>
          60+ полезных ингредиентов для ежедневной энергии, иммунитета и
          пищеварения в мармеладках с понятным вкусом.
        </p>
        <ul className={optionStyles.productBenefits}>
          {productBenefits.map((benefit) => (
            <li key={benefit}>
              <CheckCircle2 aria-hidden="true" size={18} />
              {benefit}
            </li>
          ))}
        </ul>

        <div className={optionStyles.optionBlock}>
          <h2>
            Выбери вкус: <span>{activeFlavor.name}</span>
          </h2>
          <p className={optionStyles.tasteNote}>
            Нежная ягодная кислинка, сливочный йогурт и лёгкая сладость.
          </p>
          <div className={optionStyles.flavorGrid}>
            {flavorOptions.map((flavor, index) => (
              <button
                aria-pressed={index === activeFlavorIndex}
                className={
                  index === activeFlavorIndex
                    ? optionStyles.flavorActive
                    : undefined
                }
                key={flavor.name}
                onClick={() => setActiveFlavorIndex(index)}
                type="button"
              >
                {"badge" in flavor && flavor.badge ? (
                  <span>{flavor.badge}</span>
                ) : null}
                <Image
                  alt=""
                  height={620}
                  loading="eager"
                  src={flavor.image}
                  unoptimized
                  width={620}
                />
                <strong>{flavor.name}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className={optionStyles.optionBlock}>
          <h2>
            Сахар: <span>{sugar}</span>
          </h2>
          <div className={optionStyles.choiceGrid}>
            <button
              aria-pressed={sugar === "Low Sugar"}
              className={
                sugar === "Low Sugar" ? optionStyles.choiceActive : undefined
              }
              onClick={() => setSugar("Low Sugar")}
              type="button"
            >
              Low Sugar
            </button>
            <button
              aria-pressed={sugar === "Без сахара"}
              className={
                sugar === "Без сахара" ? optionStyles.choiceActive : undefined
              }
              onClick={() => setSugar("Без сахара")}
              type="button"
            >
              Без сахара
            </button>
          </div>
        </div>
        <div className={optionStyles.optionBlock}>
          <h2>Сколько взрослых?</h2>
          <div className={optionStyles.quantitySelector}>
            <button
              aria-pressed={quantity === 1}
              className={
                quantity === 1 ? optionStyles.quantityActive : undefined
              }
              onClick={() => setQuantity(1)}
              type="button"
            >
              1
            </button>
            <button
              aria-pressed={quantity === 2}
              className={
                quantity === 2 ? optionStyles.quantityActive : undefined
              }
              onClick={() => setQuantity(2)}
              type="button"
            >
              2
            </button>
          </div>
        </div>

        <ProductPurchaseOptions
          activeIndex={activePurchaseIndex}
          onSelect={setActivePurchaseIndex}
        />

        <a className={purchaseStyles.checkoutButton} href="#details">
          Начать сейчас
        </a>
        <p className={purchaseStyles.autoDiscount}>
          Скидка применяется автоматически
        </p>
        <div className={purchaseStyles.deliveryLine}>
          <span>
            <Truck aria-hidden="true" size={18} /> СДЭК / Boxberry
          </span>
          <span>
            <RefreshCcw aria-hidden="true" size={18} /> Отмена в любой момент
          </span>
        </div>
        <div className={purchaseStyles.guaranteeNote}>
          Менее 1% покупателей используют гарантию возврата
        </div>
        <div className={purchaseStyles.trustGrid}>
          {trustBadges.map(({ icon: Icon, text }) => (
            <div className={purchaseStyles.trustCard} key={text}>
              <Icon aria-hidden="true" size={22} />
              <span>{text}</span>
            </div>
          ))}
        </div>
        <div className={profileStyles.detailsList} id="details">
          {productDetails.map((item, index) => (
            <details key={item.title} open={index === 0}>
              <summary>{item.title}</summary>
              <p>{item.content}</p>
            </details>
          ))}
        </div>
        <div className={profileStyles.sideFlavorProfile}>
          <h2>На вкус</h2>
          <div className={profileStyles.tasteGrid}>
            {tasteNotes.map((item) => (
              <div key={item.text}>
                <span>{item.icon}</span>
                <strong>{item.text}</strong>
              </div>
            ))}
          </div>
          <h2>Внутри</h2>
          <ul className={profileStyles.packedList}>
            {packedWith.map((item) => (
              <li key={item.text}>
                <span>{item.icon}</span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </section>
  );
}
