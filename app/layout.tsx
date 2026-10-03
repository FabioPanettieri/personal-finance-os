import '@fontsource-variable/inter'
import './globals.css'

import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import type { ReactNode } from 'react'

import { THEME_INIT_SCRIPT } from '@/lib/theme'

export const metadata: Metadata = {
  title: {
    default: 'Finance OS',
    template: '%s · Finance OS',
  },
  description: 'Il tuo sistema finanziario personale.',
  applicationName: 'Finance OS',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d10' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonce generato da proxy.ts: autorizza lo script inline del tema sotto CSP.
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
