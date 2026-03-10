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
  Layers, 
  Zap,
  CheckCircle2
} from "lucide-react";

import Navbar from "@/components/landing/navbar";
import Hero from "@/components/landing/hero";
import TrustedBy from "@/components/landing/trusted-by";
import ProductMockup from "@/components/landing/product-mockup";
import HowItWorks from "@/components/landing/how-it-works";
import Testimonials from "@/components/landing/testimonials";
import FAQ from "@/components/landing/faq";
import Footer from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * DATA OMEN LANDING PAGE
 * Strategy: Hybrid Performance & Service Clarity.
 * We highlight the "Modular Strategy" by showing services as specialized agents.
 */
export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-background selection:bg-primary/10">
      <Navbar />

      <main className="flex-1">
        {/* 1. HERO SECTION: The Hook */}
        <section className="relative pt-20 pb-16 md:pt-32 md:pb-24">
          <Hero />
        </section>

        {/* 2. SOCIAL PROOF */}
        <section className="border-y bg-muted/30 py-10">
          <div className="container px-4">
            <p className="text-center text-xs font-bold text-muted-foreground mb-8 uppercase tracking-[0.2em]">
              Trusted by high-performance data teams
            </p>
            <TrustedBy />
          </div>
        </section>

        {/* 3. PRODUCT DEMO: Chat Interface visualization */}
        <section id="demo" className="py-24 bg-gradient-to-b from-background to-muted/20">
          <div className="container px-4">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                Analyze data as fast as you think.
              </h2>
              <p className="text-xl text-muted-foreground">
                Skip the SQL. Stop the spreadsheet wrestling. 
                Just upload your data and ask questions.
              </p>
            </div>
            <ProductMockup />
          </div>
        </section>

        {/* 4. SERVICES HIGHLIGHT: Our Core Value Propositions */}
        <section id="services" className="py-24 border-t border-b bg-black text-white">
          <div className="container px-4">
            <div className="mb-16">
              <h2 className="text-primary font-mono text-sm uppercase tracking-widest mb-4">Our Services</h2>
              <h3 className="text-4xl md:text-5xl font-bold max-w-2xl">
                Advanced Intelligence for every stage of your data lifecycle.
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Service 1: AI Chat & Exploration */}
              <Card className="bg-zinc-900 border-zinc-800 text-white">
                <CardHeader>
                  <MessageSquare className="h-10 w-10 text-primary mb-2" />
                  <CardTitle className="text-2xl">Conversational Analytics</CardTitle>
                </CardHeader>
                <CardContent className="text-zinc-400">
                  Talk to your database using natural language. Our 
                  <strong> Semantic Router</strong> ensures your queries are 
                  translated into precise SQL with 99% accuracy.
                </CardContent>
              </Card>

              {/* Service 2: Predictive Modeling */}
              <Card className="bg-zinc-900 border-zinc-800 text-white">
                <CardHeader>
                  <LineChart className="h-10 w-10 text-primary mb-2" />
                  <CardTitle className="text-2xl">Predictive Modeling</CardTitle>
                </CardHeader>
                <CardContent className="text-zinc-400">
                  Leverage built-in <strong>Linear Algebra</strong> modules 
                  for trend forecasting, seasonality detection, and anomaly 
                  spotting without writing a single line of Python.
                </CardContent>
              </Card>

              {/* Service 3: Automated Narratives */}
              <Card className="bg-zinc-900 border-zinc-800 text-white">
                <CardHeader>
                  <Layers className="h-10 w-10 text-primary mb-2" />
                  <CardTitle className="text-2xl">Narrative Generation</CardTitle>
                </CardHeader>
                <CardContent className="text-zinc-400">
                  Don't just look at charts—read the story. Our 
                  <strong> Narrative Service</strong> generates executive 
                  summaries and insights automatically from your datasets.
                </CardContent>
              </Card>

              {/* Service 4: High-Performance Ingestion */}
              <Card className="bg-zinc-900 border-zinc-800 text-white">
                <CardHeader>
                  <Database className="h-10 w-10 text-primary mb-2" />
                  <CardTitle className="text-2xl">Multi-Source Ingestion</CardTitle>
                </CardHeader>
                <CardContent className="text-zinc-400">
                  Connect Stripe, Google Analytics, or your raw Parquet files. 
                  Our <strong>Modular Strategy</strong> makes it easy to sync 
                  across R2, S3, or local storage.
                </CardContent>
              </Card>

              {/* Service 5: Edge Compute */}
              <Card className="bg-zinc-900 border-zinc-800 text-white">
                <CardHeader>
                  <Cpu className="h-10 w-10 text-primary mb-2" />
                  <CardTitle className="text-2xl">Vectorized Computation</CardTitle>
                </CardHeader>
                <CardContent className="text-zinc-400">
                  Blazing fast execution using <strong>DuckDB</strong>. 
                  We perform in-process analytical processing to keep 
                  latency sub-second, even with millions of rows.
                </CardContent>
              </Card>

              {/* Service 6: Secure Isolation */}
              <Card className="bg-zinc-900 border-zinc-800 text-white">
                <CardHeader>
                  <ShieldCheck className="h-10 w-10 text-primary mb-2" />
                  <CardTitle className="text-2xl">Tenant Isolation</CardTitle>
                </CardHeader>
                <CardContent className="text-zinc-400">
                  Enterprise-grade security by design. Your data is 
                  partitioned at the schema level, ensuring absolute 
                  privacy and compliance for every tenant.
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* 5. PROCESS: How It Works */}
        <section id="process" className="py-24">
          <HowItWorks />
        </section>

        {/* 6. SOCIAL PROOF: Testimonials */}
        <section className="py-24 bg-muted/20">
          <Testimonials />
        </section>

        {/* 7. FAQ */}
        <section id="faq" className="py-24">
          <div className="container px-4 max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl font-bold">Frequently Asked Questions</h2>
          </div>
          <FAQ />
        </section>

        {/* 8. FINAL CTA */}
        <section className="relative py-24 overflow-hidden border-t">
          <div className="absolute inset-0 bg-primary/5 -z-10" />
          <div className="container px-4 text-center">
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tighter mb-6">
              Start making data-driven decisions.
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Free forever for individual analysts. Enterprise-grade 
              performance for growing teams.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="h-14 px-8 text-lg font-semibold group" asChild>
                <Link href="/register">
                  Get Started for Free
                  <MoveRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg" asChild>
                <Link href="/login">Explore Demo</Link>
              </Button>
            </div>
            <div className="mt-8 flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-primary" /> SOC2 Compliant
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-primary" /> HIPAA Ready
              </span>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}