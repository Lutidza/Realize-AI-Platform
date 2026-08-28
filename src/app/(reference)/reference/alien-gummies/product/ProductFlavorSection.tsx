/**
 * @file src/app/(reference)/reference/alien-gummies/product/ProductFlavorSection.tsx
 * @version 2026-07-21
 * @description Route-private product flavor grid matching the reference PDP card structure.
 */
import Image from "next/image";

import { productReferenceMedia as media } from "./productReferenceMedia";
import styles from "./ProductFlavorSection.module.css";

const flavors = [
  {
    badge: "Новинка",
    image: media.flavorRaspberry,
    name: "Малиновый лимонад",
    oldPrice: "3 990 ₽",
    price: "от 2 990 ₽",
    tone: "berry",
  },
  {
    image: media.flavorOriginal,
    name: "Йогуртовые ягоды",
    oldPrice: "3 690 ₽",
    price: "от 2 790 ₽",
    tone: "pink",
  },
  {
    badge: "Kids",
    image: media.product,
    name: "Cosmo Gummy Kids",
    oldPrice: "3 290 ₽",
    price: "от 2 490 ₽",
    tone: "cream",
  },
] as const;

/** Renders the three reference-matched flavor cards. */
export function ProductFlavorSection() {
  return (
    <section className={styles.section}>
      <h2>Подбери свой вкус</h2>
      <div className={styles.grid}>
        {flavors.map((flavor) => (
          <article className={styles[flavor.tone]} key={flavor.name}>
            <div className={styles.media}>
              {"badge" in flavor && flavor.badge ? (
                <span>{flavor.badge}</span>
              ) : null}
              <Image
                alt={`Упаковка ${flavor.name}`}
                height={620}
                loading="eager"
                src={flavor.image}
                unoptimized
                width={620}
              />
            </div>
            <h3>{flavor.name}</h3>
            <p>
              {flavor.price} <del>{flavor.oldPrice}</del>
            </p>
            <a href="#purchase">Купить</a>
          </article>
        ))}
      </div>
    </section>
  );
}
