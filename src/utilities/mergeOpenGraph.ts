/**
 * @file src/utilities/mergeOpenGraph.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Объединяет metadata Open Graph с настройками сайта по умолчанию.
 */

import type { Metadata } from 'next'

const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
  description: 'Storefront and content management with Realize — AI Platform.',
  images: [
    {
      url: '/og-image.svg',
    },
  ],
  siteName: 'Realize — AI Platform',
  title: 'Realize — AI Platform',
}

export const mergeOpenGraph = (og?: Partial<Metadata['openGraph']>): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : defaultOpenGraph.images,
  }
}
