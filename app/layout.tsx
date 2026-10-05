import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { DEFAULT_OG_IMAGE_URL, SITE_URL } from '@/lib/site'
import './globals.css'

// Fonts are bundled with the app instead of fetched from Google Fonts at
// build time, so a Google outage or odd response can't fail a deploy.
// GeistSans/GeistMono expose --font-geist-sans / --font-geist-mono.
const geist = GeistSans;
const geistMono = GeistMono;

// Variable Latin subset (SIL OFL), covering the 600 and 700 weights we use.
const playfair = localFont({
  src: './fonts/playfair-display-latin.woff2',
  variable: '--font-playfair',
  weight: '600 700',
  display: 'swap',
});

// Explicitly export Viewport to resolve the Lighthouse tag warning in Next.js 14+
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: 'B2B Prospect Research With Source Evidence | Arcli',
  description: 'Arcli turns your website into a B2B targeting brief and helps you review prospects with source-linked evidence before outreach.',
  generator: 'Next.js',
  metadataBase: new URL(SITE_URL),

  openGraph: {
    title: 'B2B Prospect Research With Source Evidence | Arcli',
    description: 'Arcli turns your website into a B2B targeting brief and helps you review prospects with source-linked evidence before outreach.',
    url: SITE_URL,
    siteName: 'Arcli',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: DEFAULT_OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: 'Arcli helps B2B founders review buyer-intent evidence from public conversations',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image', 
    title: 'B2B Prospect Research With Source Evidence | Arcli',
    description: 'Arcli turns your website into a B2B targeting brief and helps you review prospects with source-linked evidence before outreach.',
    images: [DEFAULT_OG_IMAGE_URL],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${playfair.variable}`}>
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
