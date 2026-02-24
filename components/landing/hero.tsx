'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, PlayCircle, BarChart3, TrendingUp, Users } from 'lucide-react'
import Link from 'next/link'

export function Hero() {
  return (
    <div className="relative overflow-hidden bg-background pt-20 pb-16 md:pt-32 md:pb-24">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-96 bg-primary/10 blur-[120px] rounded-full opacity-50" />
      
      <div className="container relative z-10 mx-auto px-6">
        <div className="flex flex-col items-center text-center">
          <Badge variant="outline" className="mb-6 px-4 py-1.5 border-primary/20 bg-primary/5 text-primary animate-fade-in">
            Now in Private Beta
          </Badge>
          
          <h1 className="max-w-4xl text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70">
            Your Autonomous <br className="hidden md:block" />
            <span className="text-primary">Data Department</span>
          </h1>
          
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed">
            Connect your database, ask questions in plain English. AI cleans, queries, and narrates your business insights. No SQL. No dashboards. Just answers.
          </p>
          
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <Link href="/login">
              <Button size="lg" className="h-12 px-8 text-base font-semibold group">
                Get Early Access
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base font-semibold">
                <PlayCircle className="mr-2 h-5 w-5" />
                Watch Demo
              </Button>
            </Link>
          </div>

          {/* Interactive UI Mockup (The "You/AI" Chat Experience) */}
          <div className="mt-20 w-full max-w-4xl mx-auto rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 border-b border-border flex items-center justify-between">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/50" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                <div className="h-3 w-3 rounded-full bg-green-500/20 border border-green-500/50" />
              </div>
              <span className="text-xs font-mono text-muted-foreground">app.dataomen.ai</span>
            </div>
            
            <div className="p-6 md:p-8 space-y-8 text-left">
              {/* User Input */}
              <div className="flex items-start gap-4">
                <div className="h-8 w-8 rounded bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold text-xs border border-blue-500/20">You</div>
                <p className="text-lg font-medium">Why did revenue drop in Q3?</p>
              </div>

              {/* AI Response */}
              <div className="flex items-start gap-4">
                <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-xs border border-primary/20">AI</div>
                <div className="flex-1 space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" /> Revenue by Quarter
                    </h3>
                    <div className="mt-4 flex items-end gap-2 h-32">
                      <div className="bg-primary/20 w-full h-[60%] rounded-t" />
                      <div className="bg-primary/40 w-full h-[85%] rounded-t" />
                      <div className="bg-primary w-full h-[45%] rounded-t relative">
                         <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-primary">-24%</div>
                      </div>
                      <div className="bg-primary/20 w-full h-[10%] rounded-t border-t border-dashed border-primary" />
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] font-medium text-muted-foreground uppercase">
                      <span>Q1</span><span>Q2</span><span className="text-primary font-bold">Q3</span><span>Q4</span>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-border pt-6">
                    <h3 className="text-sm font-bold text-foreground">Executive Summary</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Q3 revenue declined <span className="text-foreground font-semibold">24% YoY</span> driven by reduced enterprise renewals. Churn spiked from 3.2% to 5.8% in mid-market. New acquisition held steady at <span className="text-foreground font-semibold">127 accounts</span> suggesting the pipeline is healthy but retention needs immediate attention.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}