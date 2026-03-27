// app/(landing)/security/page.tsx

import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Security & GDPR | Arcli.tech',
  description: 'Learn how Arcli.tech secures your analytical data with ephemeral compute, strict tenant isolation, and GDPR-compliant infrastructure.',
};

export default function SecurityPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 sm:py-24 space-y-12 text-slate-800 dark:text-slate-200">
      
      {/* Header Section */}
      <header className="space-y-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Security & GDPR
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          At Arcli.tech, security is an architectural baseline, not an afterthought. 
          We built our Zero-ETL pipeline on the principles of ephemeral compute, strict tenant isolation, and least-privilege access.
        </p>
      </header>

      {/* Security Architecture Section */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white border-b pb-2 border-slate-200 dark:border-slate-800">
          Infrastructure & Architecture Security
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <SecurityCard 
            title="Strict Tenant Isolation" 
            description="Your data is never co-mingled in a monolithic database. Ingested JSON is normalized and saved to dedicated, cryptographically isolated S3/Cloudflare R2 prefixes (e.g., /tenant={id}/). Queries can only access files within your specific prefix."
          />
          <SecurityCard 
            title="Ephemeral Compute (DuckDB)" 
            description="Our query engine spins up an isolated, sandboxed DuckDB process for every single query. Memory is strictly governed, and the process is immediately destroyed after execution, meaning no residual data remains in memory."
          />
          <SecurityCard 
            title="Authentication & Identity" 
            description="We utilize Supabase for enterprise-grade authentication. All sessions are secured via JWTs, and row-level security (RLS) is enforced at the database layer to ensure users can only access their authorized environments."
          />
          <SecurityCard 
            title="Data in Transit & At Rest" 
            description="All traffic to and from Arcli.tech is encrypted via TLS 1.3. Data at rest in our data lake (Parquet files) is encrypted using AES-256 standard encryption via our storage providers."
          />
        </div>
      </section>

      {/* GDPR Section */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white border-b pb-2 border-slate-200 dark:border-slate-800">
          GDPR & Data Privacy
        </h2>
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p>
            Arcli.tech complies with the General Data Protection Regulation (GDPR). We act as a <strong>Data Processor</strong> for the SaaS data you connect, while you remain the Data Controller.
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-4">
            <li>
              <strong>Right to Erasure (Right to be Forgotten):</strong> Because of our decentralized data lake architecture, executing a data deletion request is instantaneous and absolute. When a workspace is deleted, the corresponding isolated storage prefix is permanently purged.
            </li>
            <li>
              <strong>Data Portability:</strong> You maintain full ownership of your data. You can request an export of your normalized Parquet files at any time.
            </li>
            <li>
              <strong>Sub-processors:</strong> We use industry-leading, compliant sub-processors including DigitalOcean (hosting), Vercel (edge delivery), Cloudflare (networking & storage), and Supabase (authentication).
            </li>
          </ul>
        </div>
      </section>

      {/* Contact Section */}
      <section className="bg-slate-50 dark:bg-slate-900 rounded-xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-4">
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Security Inquiries</h3>
        <p className="text-slate-600 dark:text-slate-400">
          Have specific questions about our security posture, or need to report a vulnerability? 
          Our engineering team is ready to assist.
        </p>
        <div className="pt-4">
          <a 
            href="mailto:support@arcli.tech" 
            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            Contact support@arcli.tech
          </a>
        </div>
      </section>

      <footer className="pt-8 text-sm text-slate-500 dark:text-slate-400 text-center">
        <p>Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        <div className="flex justify-center gap-4 mt-4">
          <Link href="/privacy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-blue-600 transition-colors">Terms of Service</Link>
        </div>
      </footer>
    </main>
  );
}

// Helper component for clean, modular UI
function SecurityCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        {description}
      </p>
    </div>
  );
}