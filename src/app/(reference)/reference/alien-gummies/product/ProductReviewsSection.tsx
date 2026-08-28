/**
 * @file src/app/(reference)/reference/alien-gummies/product/ProductReviewsSection.tsx
 * @version 2026-07-21
 * @description Full route-private customer review summary, controls, and review feed.
 */
"use client";

import {
  CheckCircle2,
  Gift,
  Heart,
  Search,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { ratingBars, reviews } from "./productReviewsContent";
import styles from "./ProductReviewsSection.module.css";
import summaryStyles from "./ProductReviewsSummary.module.css";

type ReviewFilterFieldsProps = {
  onPhotoOnlyChange: (checked: boolean) => void;
  onQueryChange: (query: string) => void;
  onRatingChange: (rating: "4" | "5" | "all") => void;
  onSortChange: (sort: "newest" | "oldest") => void;
  photoOnly: boolean;
  query: string;
  rating: "4" | "5" | "all";
  sort: "newest" | "oldest";
};

function FiveStars({ rating = 5 }: { rating?: number }) {
  return (
    <span aria-label={`Оценка ${rating} из 5`} className={summaryStyles.stars}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          aria-hidden="true"
          fill={index < rating ? "currentColor" : "none"}
          key={index}
          opacity={index < rating ? 1 : 0.35}
          size={20}
        />
      ))}
    </span>
  );
}

function ReviewFilterFields({
  onPhotoOnlyChange,
  onQueryChange,
  onRatingChange,
  onSortChange,
  photoOnly,
  query,
  rating,
  sort,
}: ReviewFilterFieldsProps) {
  return (
    <>
      <label>
        <span className={styles.srOnly}>Поиск</span>
        <input
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Поиск"
          type="search"
          value={query}
        />
        <Search aria-hidden="true" size={17} />
      </label>
      <select
        aria-label="Сортировка"
        onChange={(event) =>
          onSortChange(event.target.value as "newest" | "oldest")
        }
        value={sort}
      >
        <option value="newest">Сначала новые</option>
        <option value="oldest">Сначала старые</option>
      </select>
      <select
        aria-label="Рейтинг"
        onChange={(event) =>
          onRatingChange(event.target.value as "4" | "5" | "all")
        }
        value={rating}
      >
        <option value="all">Любой рейтинг</option>
        <option value="5">5 звёзд</option>
        <option value="4">4 звезды</option>
      </select>
      <label className={styles.checkbox}>
        <input
          checked={photoOnly}
          onChange={(event) => onPhotoOnlyChange(event.target.checked)}
          type="checkbox"
        />{" "}
        Фото и видео
      </label>
    </>
  );
}

/** Renders the full reference-style review widget and five-review feed. */
export function ProductReviewsSection() {
  const [photoOnly, setPhotoOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [rating, setRating] = useState<"4" | "5" | "all">("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [visibleCount, setVisibleCount] = useState(5);
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const filteredReviews = reviews
    .filter(
      (review) =>
        !normalizedQuery ||
        `${review.name} ${review.title} ${review.body} ${review.product}`
          .toLocaleLowerCase("ru")
          .includes(normalizedQuery),
    )
    .filter(
      (review) => !photoOnly || ("photo" in review && Boolean(review.photo)),
    )
    .filter((review) => rating === "all" || review.rating === Number(rating));
  const orderedReviews =
    sort === "newest" ? filteredReviews : [...filteredReviews].reverse();
  const visibleReviews = orderedReviews.slice(0, visibleCount);
  const filterProps: ReviewFilterFieldsProps = {
    onPhotoOnlyChange: setPhotoOnly,
    onQueryChange: setQuery,
    onRatingChange: setRating,
    onSortChange: setSort,
    photoOnly,
    query,
    rating,
    sort,
  };

  return (
    <section className={summaryStyles.section}>
      <div className={summaryStyles.inner}>
        <h2 className={summaryStyles.heading}>Отзывы покупателей</h2>
        <div className={summaryStyles.ratingSummary}>
          <div className={summaryStyles.score}>
            <strong>4.76</strong>
            <FiveStars />
            <span>101 479 отзывов</span>
          </div>
          <div className={summaryStyles.breakdown}>
            {ratingBars.map((width, index) => (
              <div key={width}>
                <span>{5 - index}</span>
                <i>
                  <b style={{ width: `${width}%` }} />
                </i>
              </div>
            ))}
          </div>
        </div>

        <div className={summaryStyles.summary}>
          <strong>
            Что говорят покупатели <CheckCircle2 aria-hidden="true" size={16} />
          </strong>
          <p>
            Покупатели чаще всего отмечают десертный вкус, индивидуальные стики,
            понятную подписку и отсутствие шейкера. Многие пишут, что такой
            формат легче встроить в ежедневный ритм.
          </p>
        </div>

        <div className={styles.desktopFilters} aria-label="Фильтры отзывов">
          <ReviewFilterFields {...filterProps} />
        </div>
        <details className={styles.mobileFilters}>
          <summary>
            <SlidersHorizontal aria-hidden="true" size={16} /> Фильтр
          </summary>
          <div className={styles.mobileFilterFields}>
            <ReviewFilterFields {...filterProps} />
          </div>
        </details>

        <div className={styles.feed}>
          {visibleReviews.map((review) => (
            <article key={review.name}>
              <div className={styles.reviewer}>
                <span>{review.initials}</span>
                <div>
                  <strong>{review.name}</strong>
                  <small>
                    <CheckCircle2 aria-hidden="true" size={13} /> Проверенный
                    покупатель
                  </small>
                  <em>{review.city}</em>
                </div>
              </div>
              <div className={styles.reviewBody}>
                <div className={styles.reviewMeta}>
                  <FiveStars rating={review.rating} />
                  <time>{review.time}</time>
                </div>
                <h3>{review.title}</h3>
                <p>{review.body}</p>
                {"photo" in review && review.photo ? (
                  <Image
                    alt="Фото из отзыва"
                    height={200}
                    src={review.photo}
                    unoptimized
                    width={200}
                  />
                ) : null}
                <small>Отзыв о Cosmo Gummy — {review.product}</small>
                <div className={styles.recommend}>
                  <span>
                    <Heart aria-hidden="true" fill="currentColor" size={14} />{" "}
                    Рекомендую
                  </span>
                  <span>Полезно △ ▽</span>
                </div>
              </div>
            </article>
          ))}
          {visibleReviews.length === 0 ? (
            <p className={styles.empty}>Отзывы по этому запросу не найдены.</p>
          ) : null}
        </div>
        {visibleCount < orderedReviews.length ? (
          <button
            className={styles.moreButton}
            onClick={() => setVisibleCount(orderedReviews.length)}
            type="button"
          >
            Показать ещё отзывы
          </button>
        ) : null}
        <p className={styles.provider}>
          <Gift aria-hidden="true" size={14} /> Проверено покупателями Cosmo
          Gummy
        </p>
      </div>
    </section>
  );
}
