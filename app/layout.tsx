// app/layout.tsx

import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const SITE_URL = 'https://arcli.tech'
const DEFAULT_OG_IMAGE_URL = `${SITE_URL}/api/og`

const geist = Geist({ 
  subsets: ["latin"],
  variable: '--font-geist-sans' 
});

const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: '--font-geist-mono'
});

export const metadata: Metadata = {
  metadataBase: new URL('https://arcli.tech'),
  title: 'Arcli - Your Autonomous Data Department',
  description: 'Stop writing SQL and building messy dashboards. Connect your database, ask questions in plain English, and let autonomous AI agents clean, query, and narrate your business insights instantly.',
  generator: 'Next.js',
  alternates: {
    canonical: 'https://arcli.tech',
  },
  openGraph: {
    type: 'website',
    url: 'https://arcli.tech',
    title: 'Arcli | Your AI Data Analyst',
    description: 'Autonomous agents that watch your data 24/7.',
    siteName: 'Arcli',
    locale: 'en_US',
    // Next.js automatically finds app/opengraph-image.jpg
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Arcli | Your AI Data Analyst',
    description: 'Autonomous agents that watch your data 24/7.',
    // Next.js automatically finds app/twitter-image.jpg
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          forcedTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}