/**
 * @file src/app/(reference)/reference/alien-gummies/product/ProductAuthoritySection.tsx
 * @version 2026-07-21
 * @description Route-private authority story with a reference-matched image and quote split.
 */
import Image from "next/image";

import styles from "./ProductAuthoritySection.module.css";

type ProductAuthoritySectionProps = {
  imageSrc: string;
};

/** Renders the 50/50 authority quote section. */
export function ProductAuthoritySection({
  imageSrc,
}: ProductAuthoritySectionProps) {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <figure>
          <Image
            alt="Амбассадор с ежедневным стиком на горном склоне"
            height={720}
            loading="eager"
            src={imageSrc}
            unoptimized
            width={720}
          />
        </figure>
        <div className={styles.copy}>
          <h2>“Полезная привычка должна быть доступна каждому”</h2>
          <p>
            Мы собрали ежедневную порцию так, чтобы она не требовала шейкера,
            десятка банок или сложного расписания. Один стик помещается в
            карман, а понятный ягодно-йогуртовый вкус помогает не бросать рутину
            через неделю.
          </p>
          <strong>Команда R&amp;D Cosmo Gummy</strong>
          <span>Разработка формулы и контроль качества</span>
          <a href="#purchase">Купить сейчас</a>
          <small>
            БАД. Не является лекарственным средством. Перед применением
            ознакомьтесь с составом и противопоказаниями.
          </small>
        </div>
      </div>
    </section>
  );
}
