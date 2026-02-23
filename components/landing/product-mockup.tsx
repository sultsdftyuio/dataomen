'use client'

import { useEffect, useState } from 'react'

const BARS = [
  { label: 'Q1', value: 72, color: 'bg-primary' },
  { label: 'Q2', value: 89, color: 'bg-primary' },
  { label: 'Q3', value: 48, color: 'bg-destructive' },
  { label: 'Q4', value: 65, color: 'bg-primary/50' },
]

export function ProductMockup() {
  const [animated, setAnimated] = useState(false)
  const [typedText, setTypedText] = useState('')
  const fullQuestion = 'Why did revenue drop in Q3?'

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimated(true)
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )

    const el = document.getElementById('product-mockup')
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!animated) return
    let i = 0
    const interval = setInterval(() => {
      setTypedText(fullQuestion.slice(0, i + 1))
      i++
      if (i >= fullQuestion.length) clearInterval(interval)
    }, 45)
    return () => clearInterval(interval)
  }, [animated])

  return (
    <div
      id="product-mockup"
      className={`relative mx-auto max-w-4xl transition-all duration-1000 ${
        animated ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      }`}
    >
      {/* Window Frame */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-primary/5 dark:shadow-primary/10">
        {/* Title Bar */}
        <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
            <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
            <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
          </div>
          <div className="mx-auto rounded-md bg-background/80 px-12 py-1">
            <span className="font-mono text-xs text-muted-foreground">app.dataomen.ai</span>
          </div>
          <div className="w-[52px]" />
        </div>

        <div className="p-6 sm:p-8">
          {/* Chat Input Area */}
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              You
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-border bg-secondary/50 px-5 py-3">
              <p className="font-mono text-sm text-foreground">
                {typedText}
                {animated && typedText.length < fullQuestion.length && (
                  <span className="ml-0.5 inline-block h-4 w-0.5 bg-primary" style={{ animation: 'typing-cursor 0.8s infinite' }} />
                )}
              </p>
            </div>
          </div>

          {/* AI Response Area */}
          <div className={`flex items-start gap-3 transition-all duration-700 delay-[1500ms] ${animated ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              AI
            </div>
            <div className="flex-1 space-y-4">
              {/* Chart */}
              <div className="rounded-xl border border-border bg-background p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Revenue by Quarter</span>
                  <span className="font-mono text-xs text-muted-foreground">FY 2024</span>
                </div>
                <div className="flex h-36 items-end gap-3 sm:h-44 sm:gap-4">
                  {BARS.map((bar, i) => (
                    <div key={bar.label} className="flex flex-1 flex-col items-center gap-2">
                      <div className="relative w-full overflow-hidden rounded-t-md bg-secondary">
                        <div
                          className={`${bar.color} w-full rounded-t-md transition-all duration-700 ease-out`}
                          style={{
                            height: animated ? `${(bar.value / 100) * 144}px` : '0px',
                            transitionDelay: `${1800 + i * 150}ms`,
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Card */}
              <div className={`rounded-xl border border-primary/20 bg-primary/5 p-5 transition-all duration-700 delay-[2600ms] ${animated ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" style={{ animation: 'pulse-subtle 2s infinite' }} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">Executive Summary</span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Q3 revenue declined <span className="font-semibold text-foreground">24% YoY</span> driven by reduced enterprise renewals. Churn spiked from 3.2% to 5.8% in mid-market. New acquisition held steady at <span className="font-semibold text-foreground">127 accounts</span> suggesting the pipeline is healthy but retention needs immediate attention.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reflection shadow */}
      <div className="mx-8 h-16 rounded-b-xl bg-primary/5 blur-xl dark:bg-primary/10" />
    </div>
  )
}
