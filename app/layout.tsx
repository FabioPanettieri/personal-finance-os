import '@fontsource-variable/inter'
import './globals.css'

import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import type { ReactNode } from 'react'

import { ServiceWorkerRegistration } from '@/components/layout/service-worker'
import { THEME_INIT_SCRIPT } from '@/lib/theme'

export const metadata: Metadata = {
  title: {
    default: 'Finanze',
    template: '%s · Finanze',
  },
  description: 'Il tuo sistema finanziario personale.',
  applicationName: 'Finanze',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
  formatDetection: { telephone: false },
  appleWebApp: { capable: true, title: 'Finanze', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#0a0b0f',
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
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
