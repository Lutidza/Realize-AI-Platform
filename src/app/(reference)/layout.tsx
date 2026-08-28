import type { ReactNode } from 'react'

import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'

type ReferenceLayoutProps = {
  children: ReactNode
}

export default function ReferenceLayout({ children }: ReferenceLayoutProps) {
  return (
    <html className={[GeistSans.variable, GeistMono.variable].join(' ')} lang="ru">
      <head>
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      </head>
      <body style={{ margin: 0, minWidth: 320 }}>{children}</body>
    </html>
  )
}
