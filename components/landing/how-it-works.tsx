'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload, MessageCircle, Zap } from 'lucide-react'

const STEPS = [
  {
    num: '01',
    icon: Upload,
    title: 'Ingest',
    description: 'Connect your Postgres database or upload a file. We auto-detect schema, relationships, and data types.',
    code: '$ dataomen connect postgres://user:***@host/db\n\n  Scanning schema...  3 tables found\n  users (12,847 rows)\n  orders (89,231 rows)\n  products (1,204 rows)\n\n  Ready.',
  },
  {
    num: '02',
    icon: MessageCircle,
    title: 'Explore',
    description: 'Chat with your metrics to uncover hidden trends. Ask in plain English, get precise SQL under the hood.',
    code: '> "Show me top customers by lifetime value\n   who churned in the last 90 days"\n\nGenerating SQL... done (234ms)\nFound 23 matching records\nRendering chart...',
  },
  {
    num: '03',
    icon: Zap,
    title: 'Dominate',
    description: 'Receive automated, actionable narratives. Anomaly detection runs 24/7, alerting you before problems surface.',
    code: '  ALERT: Revenue anomaly detected\n  \n  Segment: Mid-market (50-200 seats)\n  Deviation: -18.3% vs 30-day avg\n  Root cause: 3 enterprise downgrades\n  \n  Sent to: #revenue-alerts',
  },
]

export function HowItWorks() {
  const [visibleSteps, setVisibleSteps] = useState<Set<number>>(new Set())
  const stepsRef = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-idx'))
            setVisibleSteps((prev) => new Set(prev).add(idx))
          }
        })
      },
      { threshold: 0.2 }
    )

    stepsRef.current.forEach((el) => {
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <section id="how-it-works" className="relative border-t border-border bg-secondary/30 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <p className="mb-3 font-mono text-sm font-medium text-primary">How It Works</p>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Three steps. Zero complexity.
          </h2>
        </div>

        <div className="space-y-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            const isVisible = visibleSteps.has(i)
            return (
              <div
                key={step.num}
                ref={(el) => { stepsRef.current[i] = el }}
                data-idx={i}
                className={`grid items-center gap-8 rounded-xl border border-border bg-card p-6 transition-all duration-600 sm:p-8 md:grid-cols-2 ${
                  isVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
                }`}
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                {/* Text */}
                <div>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-primary">{step.num}</span>
                    <div className="h-px flex-1 bg-border" />
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <h3 className="mb-2 text-2xl font-bold tracking-tight text-foreground">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>

                {/* Code Block */}
                <div className="overflow-hidden rounded-lg border border-border bg-background">
                  <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">terminal</span>
                  </div>
                  <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                    <code>{step.code}</code>
                  </pre>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
