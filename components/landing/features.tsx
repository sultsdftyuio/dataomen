'use client'

import { useEffect, useRef, useState } from 'react'
import { Database, MessageSquare, FileText, Bell, Sparkles, ArrowUpRight } from 'lucide-react'

const FEATURES = [
  {
    icon: Database,
    badge: Sparkles,
    title: 'The Janitor',
    description:
      'Drop in messy CSVs. Our engine automatically standardizes, cleans, and structures your data in seconds.',
    detail: 'Handles 50+ formats including JSON, Parquet, and legacy Excel files.',
  },
  {
    icon: MessageSquare,
    title: 'The Chatter',
    description:
      'Ask complex questions in plain English. Our strict NL2SQL translation layer handles the querying with zero syntax errors.',
    detail: 'Supports joins, aggregations, window functions, and CTEs.',
  },
  {
    icon: FileText,
    title: 'The Storyteller',
    description:
      "Don't just look at charts. Generate written, executive-level summaries of your data with one click.",
    detail: 'Export as PDF, Notion page, or Slack message.',
  },
  {
    icon: Bell,
    title: 'The Proactive Watchdog',
    description:
      'Stop waiting to ask questions. Our agent runs in the background and alerts you to statistical anomalies before they become problems.',
    detail: 'Customizable thresholds with Slack, email, and webhook integrations.',
  },
]

export function Features() {
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set())
  const cardsRef = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-idx'))
            setVisibleCards((prev) => new Set(prev).add(idx))
          }
        })
      },
      { threshold: 0.15 }
    )

    cardsRef.current.forEach((el) => {
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <section id="features" className="relative px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mb-16 max-w-2xl">
          <p className="mb-3 font-mono text-sm font-medium text-primary">The Paradigm Shift</p>
          <h2 className="mb-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            A completely new way to interact with your data.
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            Four autonomous agents that replace your entire data workflow. No training required.
          </p>
        </div>

        {/* Bento-style Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon
            const BadgeIcon = feature.badge
            const isVisible = visibleCards.has(i)
            return (
              <div
                key={feature.title}
                ref={(el) => { cardsRef.current[i] = el }}
                data-idx={i}
                className={`group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-all duration-600 sm:p-8 ${
                  isVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
                }`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                {/* Hover glow */}
                <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 bg-[radial-gradient(circle_at_50%_0%,var(--primary)_0%,transparent_70%)]" style={{ opacity: 0 }} />
                <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-500 group-hover:opacity-[0.04]" style={{ background: 'radial-gradient(circle at 50% 0%, var(--primary) 0%, transparent 70%)' }} />

                <div className="relative">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    {BadgeIcon && <BadgeIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>

                  <h3 className="mb-2 text-lg font-semibold text-foreground">{feature.title}</h3>
                  <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>

                  <div className="flex items-center gap-1.5 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    <span>{feature.detail}</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
