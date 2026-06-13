import type { Metadata } from 'next'
import { Geist, Geist_Mono, Playfair_Display } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const SITE_URL = 'https://arcli.tech'
// The default OG image URL is kept for reference, though Next.js auto-injects from the app directory
const DEFAULT_OG_IMAGE_URL = `${SITE_URL}/api/og`

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

export const metadata: Metadata = {
  title: 'Arcli | SaaS Churn Recovery Platform',
  description: 'Automatically detect, recover, and measure lost SaaS revenue before churn becomes permanent. Protect your MRR with deterministic recovery intelligence.',
  generator: 'Next.js',
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  
  // Open Graph (Facebook, LinkedIn, Discord, Slack)
  openGraph: {
    title: 'Arcli | SaaS Churn Recovery Platform',
    description: 'Automatically detect, recover, and measure lost SaaS revenue before churn becomes permanent. Protect your MRR with deterministic recovery intelligence.',
    url: SITE_URL,
    siteName: 'Arcli',
    locale: 'en_US',
    type: 'website',
    // Next.js will auto-inject app/opengraph-image.jpg
  },

  // Twitter/X Card
  twitter: {
    card: 'summary_large_image', // Triggers the full-width cinematic preview
    title: 'Arcli | SaaS Churn Recovery Platform',
    description: 'Automatically detect, recover, and measure lost SaaS revenue before churn becomes permanent. Protect your MRR with deterministic recovery intelligence.',
    // Next.js will auto-inject app/twitter-image.jpg
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