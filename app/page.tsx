import { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { BlueprintHero } from '@/components/landing/blueprint-hero';
import { TrustedBy } from '@/components/landing/trusted-by';
import { HowItWorks } from '@/components/landing/how-it-works';
import { AIAgents } from '@/components/landing/Aiagents';
import { IntegrationsAndSecurity } from '@/components/landing/Integrationsandsecurity';
import ModularPipeline from '@/components/landing/modular-pipeline';
import { DeepDiveFeatures} from '@/components/landing/Deepdivefeatures';
import { BrutalistCTA } from '@/components/landing/brutalist-cta';
import Footer from '@/components/landing/footer';

// 1. Aggressive Root Metadata to Reclaim Brand Search Intent
export const metadata: Metadata = {
  title: 'Arcli Analytics | Connect Your Data. Let AI Agents Uncover Insights.',
  description: 'Stop building static dashboards. Connect your databases, SaaS tools, and data warehouses to Arcli. Our autonomous AI agents analyze your data 24/7 to deliver instant insights, detect anomalies, and answer complex questions natively.',
  keywords: [
    'Arcli Analytics',
    'AI Data Agents',
    'Autonomous Data Analysis',
    'Connect Database to AI',
    'AI Business Intelligence',
    'Automated Insights',
    'Data Analytics SaaS'
  ],
  openGraph: {
    title: 'Arcli | Autonomous AI Data Agents',
    description: 'Connect your data pipelines. Let our AI agents drive the analysis.',
    url: 'https://www.arcli.tech',
    siteName: 'Arcli Analytics',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.arcli.tech',
  }
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary/20">
      <Navbar />
      
      <main className="flex-1 flex flex-col w-full overflow-hidden">
        {/* Hero section re-focused on the core value proposition: 
          Connecting data & autonomous AI insights 
        */}
        <BlueprintHero 
          badgeText="The Next Evolution of Analytics"
          headline="Connect your data. Let AI agents uncover the insights."
          subheadline="Ditch the static dashboards. Securely connect your data sources to Arcli and deploy autonomous AI agents that proactively find anomalies, answer questions, and monitor your business metrics in real-time."
          ctaText="Deploy Your First Agent"
        />

        {/* Social Proof */}
        <TrustedBy />

        {/* Core Product Loop: Ingest -> AI Process -> Output */}
        <HowItWorks />

        {/* Highlighting the AI Brains */}
        <AIAgents />

        {/* Highlighting the Data Connection Architecture */}
        <IntegrationsAndSecurity />

        {/* The underlying engine architecture */}
        <ModularPipeline />

        {/* Detailed capabilities */}
        <DeepDiveFeatures />

        {/* Final Conversion Point */}
        <BrutalistCTA 
          headline="Ready to let AI do the heavy lifting?"
          subheadline="Connect your first database in seconds. Your AI agent is waiting to analyze it."
          buttonText="Start Analyzing for Free"
        />
      </main>

      <Footer />
    </div>
  );
}