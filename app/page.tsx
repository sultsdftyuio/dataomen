'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Database, Sparkles, MessageSquare, FileText, Bell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export default function DataOmenLanding() {
  const [isVisible, setIsVisible] = useState<Record<string, boolean>>({})
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible((prev) => ({ ...prev, [entry.target.id]: true }))
          }
        })
      },
      { threshold: 0.1 }
    )

    return () => observerRef.current?.disconnect()
  }, [])

  useEffect(() => {
    const elements = document.querySelectorAll('[data-animate]')
    elements.forEach((el) => {
      if (observerRef.current) {
        observerRef.current.observe(el)
      }
    })
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">DataOmen</span>
            </div>
            <div className="hidden gap-8 md:flex">
              <a href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                Features
              </a>
              <a href="#how-it-works" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                How it Works
              </a>
              <a href="#pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                Pricing
              </a>
            </div>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              Join Waitlist
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border px-4 py-24 sm:px-6 lg:px-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_35%_at_50%_40%,oklch(0.4_0.2_260)_0%,transparent_100%)]" />
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-balance text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Your Autonomous Data Department.
            </h1>
            <p className="mb-10 text-pretty text-lg text-muted-foreground sm:text-xl">
              Stop writing SQL and building messy dashboards. Connect your database, ask questions in plain English, and let AI clean, query, and narrate your business insights instantly.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Get Early Access
              </Button>
              <Button size="lg" variant="outline">
                View Demo
              </Button>
            </div>
          </div>

          {/* Dashboard Mockup */}
          <div
            id="hero-mockup"
            data-animate
            className={`mx-auto mt-16 max-w-4xl transition-all duration-1000 ${
              isVisible['hero-mockup'] ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
            }`}
          >
            <Card className="overflow-hidden border-2 border-primary/20 bg-card shadow-2xl shadow-primary/10">
              <div className="bg-gradient-to-b from-card to-secondary p-8">
                {/* Chat Bubble */}
                <div className="mb-6 flex justify-end">
                  <div className="max-w-md rounded-2xl rounded-tr-sm bg-primary px-6 py-4">
                    <p className="text-primary-foreground">Why did revenue drop in Q3?</p>
                  </div>
                </div>

                {/* Bar Chart */}
                <div className="mb-6 rounded-xl border border-border bg-background p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Revenue by Quarter</h3>
                    <span className="text-xs text-muted-foreground">2024</span>
                  </div>
                  <div className="flex h-48 items-end justify-between gap-4">
                    <div className="flex flex-1 flex-col items-center gap-2">
                      <div className="w-full rounded-t-lg bg-chart-1" style={{ height: '75%' }} />
                      <span className="text-xs text-muted-foreground">Q1</span>
                    </div>
                    <div className="flex flex-1 flex-col items-center gap-2">
                      <div className="w-full rounded-t-lg bg-chart-2" style={{ height: '85%' }} />
                      <span className="text-xs text-muted-foreground">Q2</span>
                    </div>
                    <div className="flex flex-1 flex-col items-center gap-2">
                      <div className="w-full rounded-t-lg bg-destructive" style={{ height: '55%' }} />
                      <span className="text-xs text-muted-foreground">Q3</span>
                    </div>
                    <div className="flex flex-1 flex-col items-center gap-2">
                      <div className="w-full rounded-t-lg bg-chart-4 opacity-40" style={{ height: '70%' }} />
                      <span className="text-xs text-muted-foreground">Q4</span>
                    </div>
                  </div>
                </div>

                {/* Executive Summary */}
                <Card className="border-accent/30 bg-secondary/50 p-6">
                  <div className="mb-3 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-accent" />
                    <h4 className="font-semibold">Executive Summary</h4>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Q3 revenue declined 24% YoY primarily due to reduced enterprise contract renewals. Customer churn increased from 3.2% to 5.8%, concentrated in the mid-market segment. However, new customer acquisition remained steady at 127 accounts.
                  </p>
                </Card>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="border-b border-border px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              A completely new way to interact with your data.
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Feature 1 */}
            <div
              id="feature-1"
              data-animate
              className={`transition-all duration-700 delay-100 ${
                isVisible['feature-1'] ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
              }`}
            >
              <Card className="group h-full border-2 border-border bg-card p-8 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Database className="h-6 w-6 text-primary" />
                  <Sparkles className="h-4 w-4 text-accent" style={{ marginLeft: '-8px' }} />
                </div>
                <h3 className="mb-3 text-xl font-bold">The Janitor</h3>
                <p className="leading-relaxed text-muted-foreground">
                  Drop in messy CSVs. Our engine automatically standardizes, cleans, and structures your data in seconds.
                </p>
              </Card>
            </div>

            {/* Feature 2 */}
            <div
              id="feature-2"
              data-animate
              className={`transition-all duration-700 delay-200 ${
                isVisible['feature-2'] ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
              }`}
            >
              <Card className="group h-full border-2 border-border bg-card p-8 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-3 text-xl font-bold">The Chatter</h3>
                <p className="leading-relaxed text-muted-foreground">
                  Ask complex questions in plain English. Our strict NL2SQL translation layer handles the querying with zero syntax errors.
                </p>
              </Card>
            </div>

            {/* Feature 3 */}
            <div
              id="feature-3"
              data-animate
              className={`transition-all duration-700 delay-300 ${
                isVisible['feature-3'] ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
              }`}
            >
              <Card className="group h-full border-2 border-border bg-card p-8 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                  <FileText className="h-6 w-6 text-accent" />
                </div>
                <h3 className="mb-3 text-xl font-bold">The Storyteller</h3>
                <p className="leading-relaxed text-muted-foreground">
                  {'Don\'t'} just look at charts. Generate written, executive-level summaries of your data with one click.
                </p>
              </Card>
            </div>

            {/* Feature 4 */}
            <div
              id="feature-4"
              data-animate
              className={`transition-all duration-700 delay-[400ms] ${
                isVisible['feature-4'] ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
              }`}
            >
              <Card className="group h-full border-2 border-border bg-card p-8 transition-all hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                  <Bell className="h-6 w-6 text-accent" />
                </div>
                <h3 className="mb-3 text-xl font-bold">The Proactive Watchdog</h3>
                <p className="leading-relaxed text-muted-foreground">
                  Stop waiting to ask questions. Our agent runs in the background and alerts you to statistical anomalies before they become problems.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-b border-border px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Three simple steps
            </h2>
          </div>

          <div className="relative">
            {/* Connecting Line */}
            <div className="absolute left-8 top-8 bottom-8 w-0.5 bg-gradient-to-b from-primary via-accent to-primary" />

            {/* Step 1 */}
            <div
              id="step-1"
              data-animate
              className={`relative mb-12 flex gap-6 transition-all duration-700 ${
                isVisible['step-1'] ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0'
              }`}
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-background bg-primary text-2xl font-bold text-primary-foreground">
                1
              </div>
              <div className="pt-2">
                <h3 className="mb-2 text-2xl font-bold">Ingest</h3>
                <p className="text-lg text-muted-foreground">
                  Connect your Postgres database or upload a file.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div
              id="step-2"
              data-animate
              className={`relative mb-12 flex gap-6 transition-all duration-700 delay-200 ${
                isVisible['step-2'] ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0'
              }`}
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-background bg-accent text-2xl font-bold text-accent-foreground">
                2
              </div>
              <div className="pt-2">
                <h3 className="mb-2 text-2xl font-bold">Explore</h3>
                <p className="text-lg text-muted-foreground">
                  Chat with your metrics to uncover hidden trends.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div
              id="step-3"
              data-animate
              className={`relative flex gap-6 transition-all duration-700 delay-[400ms] ${
                isVisible['step-3'] ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0'
              }`}
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-background bg-primary text-2xl font-bold text-primary-foreground">
                3
              </div>
              <div className="pt-2">
                <h3 className="mb-2 text-2xl font-bold">Dominate</h3>
                <p className="text-lg text-muted-foreground">
                  Receive automated, actionable narratives to drive your business forward.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA / Footer */}
      <section id="pricing" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div
            id="cta"
            data-animate
            className={`transition-all duration-700 ${
              isVisible['cta'] ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            }`}
          >
            <Card className="border-2 border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 p-12 text-center shadow-2xl shadow-primary/10">
              <h2 className="mb-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                Ready to stop wrestling with your data?
              </h2>
              <p className="mb-8 text-lg text-muted-foreground">
                Join the waitlist and be among the first to experience the future of data analysis.
              </p>
              <div className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 border-2 border-border bg-background"
                />
                <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Join Waitlist
                </Button>
              </div>
            </Card>
          </div>

          {/* Footer */}
          <footer className="mt-16 border-t border-border pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2024 DataOmen. All rights reserved.</p>
            <div className="mt-4 flex justify-center gap-6">
              <a href="#" className="hover:text-foreground">Privacy</a>
              <a href="#" className="hover:text-foreground">Terms</a>
              <a href="#" className="hover:text-foreground">Contact</a>
            </div>
          </footer>
        </div>
      </section>
    </div>
  )
}
