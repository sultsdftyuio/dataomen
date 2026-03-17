'use client'

import { useEffect, useState } from 'react'
import { C } from "@/lib/tokens"

const BARS = [
  { label: 'Q1', value: 72, color: 'bg-blue-500' },
  { label: 'Q2', value: 89, color: 'bg-blue-500' },
  { label: 'Q3', value: 48, color: 'bg-orange-500' },
  { label: 'Q4', value: 65, color: 'bg-blue-500/50' },
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
      <div className="overflow-hidden rounded-xl border-2 border-slate-900 bg-white shadow-[12px_12px_0px_0px_rgba(15,23,42,1)]">
        {/* Title Bar */}
        <div className="flex items-center gap-2 border-b-2 border-slate-900 bg-slate-100 px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-slate-300 border border-slate-400" />
            <div className="h-2.5 w-2.5 rounded-full bg-slate-300 border border-slate-400" />
            <div className="h-2.5 w-2.5 rounded-full bg-slate-300 border border-slate-400" />
          </div>
          <div className="mx-auto rounded-md bg-white border border-slate-300 px-12 py-1">
            <span className="font-mono text-xs text-slate-500">app.arcli.tech</span>
          </div>
          <div className="w-[52px]" />
        </div>

        <div className="p-6 sm:p-8">
          {/* User Input Area */}
          <div className="mb-8 flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-900">
              USER
            </div>
            <div className="rounded-2xl rounded-tl-sm border-2 border-slate-900 bg-white px-5 py-3 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
              <p className="font-mono text-sm font-bold text-slate-900">
                {typedText}
                {animated && typedText.length < fullQuestion.length && (
                  <span className="ml-1 inline-block h-4 w-1 bg-blue-600 animate-pulse" />
                )}
              </p>
            </div>
          </div>

          {/* Arcli AI Response Area */}
          <div className={`flex items-start gap-4 transition-all duration-700 delay-[1200ms] ${animated ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white border-2 border-blue-500">
              AI
            </div>
            <div className="flex-1 space-y-6">
              {/* Insight Summary */}
              <div className="space-y-2">
                <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Anomaly Detected in Q3 Revenue</h4>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Arcli agents identified a <span className="font-bold text-slate-900">24% YoY decline</span> specifically within the EMEA Enterprise segment. Root cause analysis points to a 40% drop in renewal rates following the August pricing migration.
                </p>
              </div>

              {/* Chart Component */}
              <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-6">
                <div className="mb-6 flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">Quarterly Revenue Trajectory</span>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                    <span className="font-mono text-[10px] font-bold text-orange-600">ANOMALY FLAGGED</span>
                  </div>
                </div>
                <div className="flex h-36 items-end gap-3 sm:h-44 sm:gap-4">
                  {BARS.map((bar, i) => (
                    <div key={bar.label} className="flex flex-1 flex-col items-center gap-3">
                      <div className="relative w-full flex items-end justify-center h-full">
                        <div
                          className={`${bar.color} w-full rounded-t-sm border-x-2 border-t-2 border-slate-900/10 transition-all duration-1000 ease-out`}
                          style={{
                            height: animated ? `${(bar.value / 100) * 100}%` : '0%',
                            transitionDelay: `${1500 + i * 150}ms`,
                          }}
                        />
                      </div>
                      <span className="font-mono text-[10px] font-black text-slate-400">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent Deep Dive Action */}
              <div className={`flex items-center justify-between rounded-lg border-2 border-blue-100 bg-blue-50/50 p-4 transition-all duration-700 delay-[2400ms] ${animated ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-blue-600" />
                  <span className="text-xs font-bold text-blue-900 uppercase tracking-wide">Root Cause deep-dive complete</span>
                </div>
                <button className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:underline">
                  View full investigation →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modern shadow/reflection */}
      <div className="mx-12 h-12 rounded-b-3xl bg-slate-900/5 blur-2xl" />
    </div>
  )
}