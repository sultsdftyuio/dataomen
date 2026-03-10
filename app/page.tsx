// app/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { 
  MoveRight, 
  Database, 
  LineChart, 
  ShieldCheck, 
  Cpu, 
  MessageSquare, 
  FileText, 
  Zap,
  CheckCircle2,
  Sparkles
} from "lucide-react";

// Fixed Imports: Using named imports {} to match your component exports
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { TrustedBy } from "@/components/landing/trusted-by";
import { ProductMockup } from "@/components/landing/product-mockup";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Testimonials } from "@/components/landing/testimonials";
import { FAQ } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * DATA OMEN LANDING PAGE - "Julius AI" Inspired
 * Focus: High-performance analytical SaaS highlighting core modular services.
 * Architecture: Hybrid Performance Paradigm (React Hooks + Vectorized Backend highlights).
 */
export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-white selection:bg-indigo-100">
      <Navbar />

      <main className="flex-1">
        {/* 1. HERO: The Conversational Hook */}
        <Hero />

        {/* 2. SOCIAL PROOF: Velocity & Trust */}
        <TrustedBy />

        {/* 3. PRODUCT DEMO: The "Julius AI" style interaction mockup */}
        <section id="demo" className="py-24 bg-slate-50/50 overflow-hidden">
          <div className="container px-4 mx-auto text-center max-w-4xl mb-16">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
              Stop writing SQL. Start asking questions.
            </h2>
            <p className="text-lg text-slate-600">
              Upload any dataset. Our AI instantly understands your schema, performs 
              vectorized computations, and renders beautiful visualizations.
            </p>
          </div>
          <ProductMockup />
        </section>

        {/* 4. SERVICE HIGHLIGHTS: Highlighting our technical edge */}
        <section id="services" className="py-24 bg-white border-y border-slate-100">
          <div className="container px-4 mx-auto max-w-6xl">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold uppercase tracking-wider mb-4">
                  <Sparkles className="w-3 h-3" /> Our Services
                </div>
                <h3 className="text-4xl font-bold text-slate-900">
                  Full-stack intelligence for high-performance data teams.
                </h3>
              </div>
              <p className="text-slate-500 max-w-sm">
                We combine the speed of DuckDB with the reasoning of LLMs to provide a modular analytical suite.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Service 1: NL2SQL & Chat */}
              <Card className="group hover:shadow-xl transition-all duration-300 border-slate-200">
                <CardHeader>
                  <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <CardTitle className="pt-4">Conversational Analytics</CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600">
                  Ask "What's my monthly churn?" and get an instant answer. Our 
                  <strong> Semantic Router</strong> ensures 99% accuracy by only 
                  providing necessary schema context to the LLM.
                </CardContent>
              </Card>

              {/* Service 2: Anomaly Detection */}
              <Card className="group hover:shadow-xl transition-all duration-300 border-slate-200">
                <CardHeader>
                  <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <LineChart className="h-6 w-6" />
                  </div>
                  <CardTitle className="pt-4">Predictive Monitoring</CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600">
                  Deploy autonomous <strong>Python Watchdogs</strong>. We use 
                  vectorized linear algebra to monitor your data 24/7 for 
                  statistical outliers and revenue drops.
                </CardContent>
              </Card>

              {/* Service 3: Data Narratives */}
              <Card className="group hover:shadow-xl transition-all duration-300 border-slate-200">
                <CardHeader>
                  <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <FileText className="h-6 w-6" />
                  </div>
                  <CardTitle className="pt-4">Automated Narratives</CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600">
                  Don't just look at bars; read the story. Our 
                  <strong> Narrative Service</strong> generates written executive 
                  summaries explaining the "why" behind the numbers.
                </CardContent>
              </Card>

              {/* Service 4: Multi-Source Ingestion */}
              <Card className="group hover:shadow-xl transition-all duration-300 border-slate-200">
                <CardHeader>
                  <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Database className="h-6 w-6" />
                  </div>
                  <CardTitle className="pt-4">One-Click Ingestion</CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600">
                  Whether it's a raw CSV or a live Stripe connection, our 
                  <strong> Modular Ingestion</strong> sanitizes and optimizes 
                  your data into high-performance Parquet files.
                </CardContent>
              </Card>

              {/* Service 5: In-Process Compute */}
              <Card className="group hover:shadow-xl transition-all duration-300 border-slate-200">
                <CardHeader>
                  <div className="h-12 w-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <Cpu className="h-6 w-6" />
                  </div>
                  <CardTitle className="pt-4">Edge Analytics</CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600">
                  Powered by <strong>DuckDB</strong>. We perform in-process 
                  analytical queries directly on the edge, delivering sub-second 
                  latency even on million-row datasets.
                </CardContent>
              </Card>

              {/* Service 6: Multi-Tenant Security */}
              <Card className="group hover:shadow-xl transition-all duration-300 border-slate-200">
                <CardHeader>
                  <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <CardTitle className="pt-4">Enterprise Isolation</CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600">
                  Security by design. Every query is partitioned by 
                  <strong> tenant_id</strong>, ensuring your private business 
                  data never leaks across account boundaries.
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* 5. PROCESS: 1-2-3 How it works */}
        <HowItWorks />

        {/* 6. TESTIMONIALS: Proof of value */}
        <Testimonials />

        {/* 7. FAQ: Overcoming objections */}
        <FAQ />

        {/* 8. FINAL CTA: Closing the loop */}
        <section className="relative py-32 overflow-hidden">
          <div className="absolute inset-0 bg-indigo-600 -z-10" />
          {/* Decorative circles */}
          <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          
          <div className="container px-4 mx-auto text-center text-white">
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-8">
              Unlock the truth in your data.
            </h2>
            <p className="text-xl text-indigo-100 mb-12 max-w-2xl mx-auto">
              Join modern data teams who spend less time on SQL and more 
              time making decisions that move the needle.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Button size="lg" variant="secondary" className="h-14 px-10 text-lg font-bold group" asChild>
                <Link href="/register">
                  Start for Free
                  <MoveRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button size="lg" className="h-14 px-10 text-lg font-semibold bg-white/10 hover:bg-white/20 border-white/20" asChild>
                <Link href="/login">Watch a Demo</Link>
              </Button>
            </div>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm text-indigo-200">
              <span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> No credit card</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> Unlimited Uploads</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> SOC2 Compliant</span>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}