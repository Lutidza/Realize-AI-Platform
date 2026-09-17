/**
 * @file src/app/(reference)/reference/realize-ai/page.tsx
 * @version 1.0.0
 * @date 2026-09-16
 * @description Подключает самостоятельный референс главной без рабочих данных CMS.
 */

import type { Metadata } from 'next'
import { RealizeHomeReference } from './RealizeHomeReference.component'

export const metadata: Metadata = {
  title: 'Realize — референс главной',
  description: 'Интерактивный фронтенд-референс Realize — AI CMS.',
  robots: { index: false, follow: false },
}

export default function RealizeReferencePage() {
  return <RealizeHomeReference />
}
