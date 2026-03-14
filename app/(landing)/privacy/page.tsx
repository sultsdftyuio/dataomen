// app/(landing)/privacy/page.tsx

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy | Dataomen",
  description: "Enterprise data privacy, security, and AI zero-retention policies for Dataomen.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Navigation */}
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
        </div>

        {/* Header */}
        <header className="mb-12 border-b border-border pb-8">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4 uppercase">
            Dataomen Privacy Policy
          </h1>
          <div className="flex flex-col sm:flex-row sm:gap-6 text-lg text-muted-foreground">
            <p>
              Last Updated: <span className="font-semibold text-foreground">March 14, 2026</span>
            </p>
            <p className="hidden sm:block text-border">|</p>
            <p>
              Effective Date: <span className="font-semibold text-foreground">March 14, 2026</span>
            </p>
          </div>
        </header>

        {/* Content */}
        <article className="prose prose-slate dark:prose-invert max-w-none space-y-8">
          <section className="lead text-lg">
            <p>
              Dataomen Inc. (&ldquo;Dataomen,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) respects your privacy and is fundamentally committed to protecting the personal and enterprise data you entrust to us. This Privacy Policy serves as a comprehensive disclosure explaining how we collect, use, process, disclose, retain, and safeguard your information when you access or use our cloud-based analytical platform, application programming interfaces (APIs), web dashboard, and related services (collectively, the &ldquo;Services&rdquo;).
            </p>
            <p>
              Given the nature of our Services—providing high-performance, AI-augmented data ingestion and analytical querying—we draw a strict legal and operational boundary between the data required to manage your account (&ldquo;Account Data&rdquo;) and the proprietary business payloads you process through our engines (&ldquo;Customer Data&rdquo;).
            </p>
            <p className="font-bold uppercase tracking-wider text-sm mt-6 mb-4">
              PLEASE READ THIS PRIVACY POLICY CAREFULLY.
            </p>
            <p>
              By accessing, registering for, or utilizing the Services, you acknowledge that you have read, understood, and explicitly agree to the collection and processing of your information as described in this Privacy Policy. If you do not agree with our policies and practices, you are expressly prohibited from using the Services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">1. Definitions</h2>
            <p>To ensure absolute clarity regarding data handling, the following definitions apply throughout this Policy:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>&ldquo;Account Data&rdquo;</strong> refers to personally identifiable information (PII) and billing details required to create your account, identify you as a user, and process payments.</li>
              <li><strong>&ldquo;Customer Data&rdquo;</strong> refers to all proprietary enterprise data, database schemas, synced records, uploaded files, and raw metrics that you ingest, upload, or connect to the Services for analytical processing.</li>
              <li><strong>&ldquo;Subprocessor&rdquo;</strong> refers to verified third-party infrastructure providers (e.g., Cloudflare, Vercel, Stripe) that Dataomen utilizes to deliver the Service.</li>
              <li><strong>&ldquo;LLM Providers&rdquo;</strong> refers to third-party providers of Large Language Models (e.g., OpenAI, Anthropic) utilized for instantaneous AI inference under strict zero-retention agreements.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">2. The Information We Collect</h2>
            <p>To provide our multi-tenant analytical architecture, we collect specific categories of information based on your interactions with the platform.</p>
            
            <h3 className="text-xl font-semibold mt-6 mb-2">A. Account Information (Identity Data)</h3>
            <p>When you register for Dataomen, our authentication infrastructure (managed via Supabase) collects strictly necessary identity data to provision your logical tenant environment. This includes:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>Full name and corporate affiliation.</li>
              <li>Business email address.</li>
              <li>Cryptographic password hashes and authentication tokens.</li>
              <li>Multi-factor authentication (MFA) setup details (if enabled).</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-2">B. Billing Information (Financial Data)</h3>
            <p>If you subscribe to a paid compute or storage tier, you must provide valid payment information. Our third-party payment processor (Stripe) collects and processes this data on our behalf.</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>This includes your billing address, corporate tax ID, and transaction history.</li>
              <li className="font-semibold text-primary">Dataomen does not directly store, process, or transmit your raw credit card numbers or primary account numbers (PAN). All financial handling is tokenized and compliant with PCI-DSS standards via Stripe.</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-2">C. Customer Data (Ingested Payloads)</h3>
            <p>This category encompasses the core operational data you bring to the platform. You retain 100% ownership of this data. We collect and process this data <em>only</em> upon your explicit instruction (e.g., configuring a sync engine or uploading a file). This includes:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li><strong>Integration Payloads:</strong> Data synchronized via our API connectors from external platforms such as Shopify, Salesforce, Snowflake, and Stripe.</li>
              <li><strong>File Uploads:</strong> Raw CSV, JSON, and Parquet files uploaded to our ingestion drop zones.</li>
              <li><strong>Database Schemas:</strong> Metadata regarding the structure of your data used to facilitate accurate natural-language-to-SQL (nl2sql) translations.</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-2">D. Telemetry, Usage, and Analytical Prompts</h3>
            <p>To ensure infrastructure stability, optimize vectorized execution pipelines, and calculate compute-based billing, we automatically collect diagnostic and usage information:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>AI Prompts & Queries:</strong> The natural language prompts you submit to our semantic router and the resulting DuckDB SQL queries generated.</li>
              <li><strong>System Telemetry:</strong> API latency metrics, synchronization success/failure rates, DuckDB compute memory utilization, and storage scan volumes.</li>
              <li><strong>Device and Network Data:</strong> IP addresses, browser user agents, operating system types, and timestamped access logs.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">3. How We Use Your Information</h2>
            <p>Dataomen adheres to the principle of data minimization. We strictly limit the processing of your data to the following operational and legal necessities:</p>
            
            <h3 className="text-xl font-semibold mt-6 mb-2">A. Executing the Core Service</h3>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li><strong>Vectorization and Analysis:</strong> Processing, normalizing, and vectorizing your Customer Data to execute high-speed analytical queries and render declarative React-based dashboards.</li>
              <li><strong>Semantic Routing:</strong> Routing your natural language prompts through our LLM pipelines to generate accurate SQL commands specific to your data schema.</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-2">B. Account Management and Support</h3>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li><strong>Authentication:</strong> Verifying your identity and maintaining secure sessions via Supabase.</li>
              <li><strong>Billing:</strong> Calculating compute usage, processing subscription renewals, and issuing invoices.</li>
              <li><strong>Customer Support:</strong> Investigating failed API synchronizations, diagnosing query logic errors, and responding to your direct inquiries.</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-2">C. Security and Infrastructure Health</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Anomaly Detection:</strong> Monitoring telemetry via our watchdog services to identify and terminate runaway recursive queries, memory exhaustion events, or unauthorized scraping attempts.</li>
              <li><strong>Threat Mitigation:</strong> Flagging suspicious login locations or attempts to bypass multi-tenant isolation boundaries.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4 text-primary">4. Artificial Intelligence & Data Processing (ZERO TRAINING GUARANTEE)</h2>
            <div className="bg-primary/5 border border-primary/20 p-6 rounded-lg text-foreground">
              <p className="mb-4">
                Dataomen understands that enterprise data privacy is the paramount concern when integrating Artificial Intelligence into data workflows. We utilize Large Language Models (LLMs) to power our natural-language-to-SQL conversion and narrative generation capabilities.
              </p>
              <p className="font-bold uppercase tracking-wider mb-4">
                We legally bind ourselves and our infrastructure to the following AI privacy guarantees:
              </p>
              <ol className="list-decimal pl-6 space-y-4">
                <li>
                  <strong>Strict Prohibition on Cross-Tenant Training:</strong> Dataomen <strong>DOES NOT</strong> and <strong>WILL NOT</strong> use your Customer Data, proprietary database schemas, connected integration payloads, or chat prompts to train, fine-tune, or improve our proprietary algorithms or any cross-tenant foundation models.
                </li>
                <li>
                  <strong>Zero-Retention by LLM Providers:</strong> We route queries exclusively through enterprise-grade API endpoints provided by our LLM inference partners. We operate under strict Enterprise/Zero-Retention agreements, meaning our LLM Providers are contractually prohibited from retaining your data, logging your prompts for human review, or using your data to train their public foundation models (e.g., GPT-4, Claude).
                </li>
                <li>
                  <strong>Cryptographic Context Scoping:</strong> All AI context windows, conversational histories, and agent memories are cryptographically scoped and locked to your specific <code>tenant_id</code>. It is architecturally impossible for your data or schemas to bleed into, influence, or be recalled by another tenant&apos;s AI session.
                </li>
              </ol>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">5. Data Sharing and Subprocessors</h2>
            <p>
              Dataomen <strong>does not sell, rent, or trade</strong> your Account Data or Customer Data to any third parties, data brokers, or advertising networks.
            </p>
            <p className="mt-4 mb-2">
              We share information solely with verified third-party infrastructure providers (Subprocessors) strictly required to operate our modular SaaS pipeline. By using the Services, you consent to the processing of your data by the following categories of Subprocessors:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Authentication & Relational Database:</strong> <em>Supabase</em> manages encrypted user credentials, role-based access control (RBAC), and relational metadata state.</li>
              <li><strong>Edge Computing & Storage:</strong> <em>Cloudflare</em> provides our Web Application Firewall (WAF), global edge routing, and highly durable object storage (Cloudflare R2) for Parquet files.</li>
              <li><strong>Compute & Hosting Platforms:</strong> <em>Vercel</em> and <em>Render</em> host our frontend interfaces and orchestrate our backend Python API compute engines.</li>
              <li><strong>Payment Processing:</strong> <em>Stripe</em> manages all secure financial transactions and subscription lifecycle events.</li>
              <li><strong>AI Inference Providers:</strong> Proprietary LLM APIs used strictly for instantaneous, stateless query generation under the Zero-Retention policies detailed in Section 4.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">6. Multi-Tenant Security and Data Protection</h2>
            <p>
              Dataomen implements enterprise-grade, defense-in-depth security architectures to protect your data. While your Customer Data resides on distributed cloud infrastructure shared with other customers, it is logically and cryptographically isolated.
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Cryptographic Tenant Isolation:</strong> Every single row of data, uploaded file, and cached schema is partitioned using a unique, immutable <code>tenant_id</code>.</li>
              <li><strong>Row-Level Security (RLS):</strong> We enforce strict Row-Level Security policies at the database layer. Every analytical query generated by the AI or user is automatically wrapped in tenant-specific execution context, physically preventing any query from scanning rows belonging to a different tenant.</li>
              <li><strong>Encryption at Rest and in Transit:</strong> All data transmitted between your browser, our APIs, and our Subprocessors is encrypted in transit using TLS 1.2/1.3. All Customer Data stored in Cloudflare R2 and Supabase is encrypted at rest using industry-standard AES-256 encryption.</li>
            </ul>
            <p className="text-sm text-muted-foreground italic mt-4">
              Disclaimer: Despite our rigorous security protocols, no method of transmission over the Internet or electronic storage is entirely secure. We cannot guarantee absolute security against advanced persistent threats or zero-day vulnerabilities.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">7. Data Retention, Sanitization, and Deletion</h2>
            <p>Dataomen enforces strict data lifecycle management to minimize liability and respect your data ownership.</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Active Accounts:</strong> We retain your Account Data and Customer Data for as long as your account is active and in good standing.</li>
              <li><strong>Account Termination & 30-Day Grace Period:</strong> Upon the cancellation, termination, or suspension of your account (due to user request or non-payment), your data immediately enters a thirty (30) day frozen grace period. During this time, compute access is revoked, but data is held intact to allow for potential reactivation or data export.</li>
              <li><strong>Permanent Sanitization (Hard Deletion):</strong> Upon the expiration of the 30-day grace period, our automated sanitization protocols execute irreversible hard deletions of your entire logical environment. This includes purging all Customer Data, AI memory caches, synchronized integration databases, and uploaded files across Cloudflare R2 and Supabase.</li>
              <li><strong>Irreversibility:</strong> Once the sanitization protocol completes, your data cannot be recovered under any circumstances.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">8. Global Data Privacy Rights</h2>
            <p>
              Dataomen operates globally and respects international privacy frameworks, including the UAE Personal Data Protection Law (PDPL), the European General Data Protection Regulation (GDPR), and the California Consumer Privacy Act (CCPA/CPRA). Depending on your jurisdiction, you possess specific rights regarding your Account Data and Customer Data:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4 mb-4">
              <li><strong>Right to Access / Know:</strong> You have the right to request a comprehensive report of the Account Data we hold about you.</li>
              <li><strong>Right to Portability:</strong> You may export your normalized Customer Data, analytical outputs, and query histories directly via the platform dashboard at any time.</li>
              <li><strong>Right to Rectification:</strong> You may update, correct, or complete inaccurate Account Data via your account settings.</li>
              <li><strong>Right to Erasure (&ldquo;Right to be Forgotten&rdquo;):</strong> You may request the immediate execution of our data sanitization protocols to permanently delete your Account Data and Customer Data prior to the standard 30-day grace period by contacting us.</li>
              <li><strong>Right to Restrict Processing:</strong> You may request that we temporarily halt processing your data while a legal dispute is resolved.</li>
            </ul>
            <p>
              To exercise any of these Data Subject Rights (DSR), please submit a formal request to <strong>legal@dataomen.com</strong>. We will authenticate your identity and respond to your request within thirty (30) days as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">9. Cookies and Tracking Technologies</h2>
            <p>
              Our React-based frontend dashboard utilizes specific tracking technologies strictly to ensure platform functionality and security. We do not use third-party advertising or retargeting cookies within the authenticated SaaS application.
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Strictly Necessary Cookies:</strong> We rely on Supabase authentication tokens (stored in HTTP-only cookies or local storage) required to verify your session, maintain RLS context, and keep you securely logged into the platform. You cannot opt out of these if you wish to use the Service.</li>
              <li><strong>Functional Storage:</strong> We utilize local storage to remember your explicit user interface preferences, such as dark/light mode toggles and sidebar collapse states.</li>
              <li><strong>Performance and Analytics:</strong> We may utilize privacy-respecting product analytics to monitor page load times, API latency, and UI feature adoption. This data is aggregated and anonymized, used strictly to improve the engineering performance of the platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">10. Third-Party Integrations and APIs</h2>
            <p>
              The core value of Dataomen relies on pulling data from third-party services (e.g., Shopify, Salesforce, Snowflake, Stripe) via our API integration modules.
            </p>
            <p className="mt-4">
              If you explicitly authenticate and connect these third-party services, you authorize Dataomen to access, ingest, and process that data under the terms of this Privacy Policy. However, <strong>Dataomen is not responsible for the privacy practices, data collection policies, terms of service, or security breaches of Shopify, Salesforce, Snowflake, Stripe, or any other external API provider.</strong> We strongly encourage you to review the privacy policies of any third-party service before linking them to your Dataomen workspace.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">11. Cross-Border Data Transfers</h2>
            <p>
              As a globally distributed cloud platform, Dataomen and its Subprocessors may transfer, process, and store your information in jurisdictions outside of your country of residence (including the United States and the European Union). By using the Services, you consent to the transfer of your data to these jurisdictions. We ensure that all cross-border transfers comply with applicable data protection laws by utilizing standard contractual clauses (SCCs) and requiring our Subprocessors to maintain rigorous, globally recognized security certifications (e.g., SOC 2 Type II, ISO 27001).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">12. Children&apos;s Privacy</h2>
            <p>
              The Services are explicitly designed for enterprise, commercial, and professional use. Dataomen does not knowingly collect, process, or solicit personal information from individuals under the age of eighteen (18). If we become aware that we have inadvertently collected personal data from a minor, we will immediately take steps to execute our sanitization protocols and delete such information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">13. Changes to this Privacy Policy</h2>
            <p>
              Dataomen reserves the right to update, modify, or completely overhaul this Privacy Policy at our sole discretion to reflect changes in our technology architecture, Subprocessor usage, or legal obligations.
            </p>
            <p className="mt-4">
              If we make material changes to how we treat your Account Data or Customer Data (such as modifying our AI training stance), we will provide prominent notice by posting a banner on the platform dashboard and sending an email to the primary address associated with your account. Your continued use of the Services following the effective date of such updates constitutes your full acceptance of the revised Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">14. Contact Information and Data Protection Officer</h2>
            <p>
              If you have any questions, concerns, formal disputes, or requests regarding this Privacy Policy or our data handling practices, please contact our Legal and Data Protection team:
            </p>
            <address className="not-italic mt-6 p-6 bg-muted rounded-lg border border-border">
              <strong>Email:</strong> <a href="mailto:legal@dataomen.com" className="text-primary hover:underline font-medium">legal@dataomen.com</a><br /><br />
              <strong>Address:</strong><br />
              Dataomen Inc.<br />
              Ras Al Khaimah<br />
              United Arab Emirates
            </address>
            <p className="text-sm mt-4 text-muted-foreground italic">
              *For urgent security or privacy incidents, please include &quot;URGENT: PRIVACY&quot; in the subject line of your email to ensure expedited routing to our engineering and legal teams.*
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}