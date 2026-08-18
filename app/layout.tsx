import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Playfair_Display } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { DEFAULT_OG_IMAGE_URL, SITE_URL } from '@/lib/site'
import './globals.css'

const geist = Geist({ 
  subsets: ["latin"],
  variable: '--font-geist-sans' 
});

const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: '--font-geist-mono'
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: '--font-playfair',
  weight: ["600", "700"],
});

// Explicitly export Viewport to resolve the Lighthouse tag warning in Next.js 14+
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: 'Arcli | Find New Customers',
  description: 'Arcli finds online conversations from people who may need what you offer, so you can reach out at the right time.',
  generator: 'Next.js',
  metadataBase: new URL(SITE_URL),

  openGraph: {
    title: 'Arcli | Find New Customers',
    description: 'Arcli finds online conversations from people who may need what you offer, so you can reach out at the right time.',
    url: SITE_URL,
    siteName: 'Arcli',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: DEFAULT_OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: 'Arcli finds prospects from public conversations',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image', 
    title: 'Arcli | Find New Customers',
    description: 'Arcli finds online conversations from people who may need what you offer, so you can reach out at the right time.',
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
