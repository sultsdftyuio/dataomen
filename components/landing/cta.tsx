'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight } from 'lucide-react'

export function CTA() {
  return (
    <section id="pricing" className="relative px-6 py-24 sm:py-32">
      {/* Background Glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute bottom-0 left-1/2 h-[400px] w-[600px] -translate-x-1/2 translate-y-1/2 rounded-full bg-primary/5 blur-[100px] dark:bg-primary/10" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to stop wrestling{' '}
            <br className="hidden sm:block" />
            with your data?
          </h2>
          <p className="mb-8 text-base text-muted-foreground">
            Join the waitlist and be among the first to experience autonomous data analysis.
          </p>

          <div className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              placeholder="you@company.com"
              className="h-11 flex-1 bg-card"
            />
            <Button size="lg" className="h-11 gap-2 px-6">
              Join Waitlist
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Free during beta. No credit card required.
          </p>
        </div>
      </div>
    </section>
  )
}
