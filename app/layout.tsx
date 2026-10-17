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

// No maximumScale/userScalable: people must be able to pinch-zoom (WCAG 1.4.4).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'Buyer-Signal Alerts for B2B SaaS | Arcli',
  description: 'Know when someone asks for a tool like yours. Arcli finds people asking for alternatives to your competitors, checks each post with AI and drafts a reply.',
  generator: 'Next.js',
  metadataBase: new URL(SITE_URL),

  openGraph: {
    title: 'Buyer-Signal Alerts for B2B SaaS | Arcli',
    description: 'Know when someone asks for a tool like yours. Arcli finds people asking for alternatives to your competitors, checks each post with AI and drafts a reply.',
    url: SITE_URL,
    siteName: 'Arcli',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: DEFAULT_OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: 'Arcli alerts B2B founders when someone publicly asks for a tool like theirs',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image', 
    title: 'Buyer-Signal Alerts for B2B SaaS | Arcli',
    description: 'Know when someone asks for a tool like yours. Arcli finds people asking for alternatives to your competitors, checks each post with AI and drafts a reply.',
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
        {/* ThemeProvider stays the body's only child: as a sibling it can lose
            its position in the list during hydration and shift every useId
            in the app (see app/(dashboard)/layout.tsx). Analytics renders no
            markup, so it sits inside instead. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          forcedTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
