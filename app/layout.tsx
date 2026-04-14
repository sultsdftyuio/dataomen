// app/layout.tsx

import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const geist = Geist({ 
  subsets: ["latin"],
  variable: '--font-geist-sans' 
});

const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: '--font-geist-mono'
});

export const metadata: Metadata = {
  // Base information
  title: 'Arcli - Your Autonomous Data Department',
  description: 'Stop writing SQL and building messy dashboards. Connect your database, ask questions in plain English, and let autonomous AI agents clean, query, and narrate your business insights instantly.',
  generator: 'Next.js',
  metadataBase: new URL('https://arcli.tech'),
  
  // Open Graph (Facebook, LinkedIn, Discord, Slack)
  openGraph: {
    title: 'Arcli | Your AI Data Analyst',
    description: 'Autonomous agents that watch your data 24/7.',
    url: 'https://arcli.tech',
    siteName: 'Arcli',
    images: [
      {
        url: '/api/og', // Dynamically converted to https://arcli.tech/api/og
        width: 1200,
        height: 630,
        alt: 'Arcli - Autonomous Data Engine',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },

  // Twitter/X Card
  twitter: {
    card: 'summary_large_image', // Triggers the full-width cinematic preview
    title: 'Arcli | Your AI Data Analyst',
    description: 'Autonomous agents that watch your data 24/7.',
    images: ['/api/og'],
  },
}

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