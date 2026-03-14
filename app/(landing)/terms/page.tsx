// app/(landing)/terms/page.tsx

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Terms of Service | Dataomen",
  description: "Terms of Service and Acceptable Use Policy for Dataomen.",
};

export default function TermsOfServicePage() {
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
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">
            DATAOMEN TERMS OF SERVICE
          </h1>
          <p className="text-lg text-muted-foreground">
            Last Updated: <span className="font-semibold text-foreground">March 14, 2026</span>
          </p>
        </header>

        {/* Content */}
        <article className="prose prose-slate dark:prose-invert max-w-none space-y-8">
          <section className="lead text-lg">
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) constitute a legally binding agreement between Dataomen Inc. (&ldquo;Dataomen,&rdquo; &ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) and the individual or legal entity accessing or using the Services (&ldquo;you,&rdquo; &ldquo;your,&rdquo; or &ldquo;Customer&rdquo;).
            </p>
            <p>
              These Terms govern your use of Dataomen&apos;s analytical platform, website, infrastructure, APIs, mobile applications, and related services (collectively, the &ldquo;Services&rdquo;).
            </p>
            <p>
              By clicking &ldquo;I Agree,&rdquo; creating an account, or using the Services, you acknowledge that you have read, understood, and agree to be bound by these Terms.
            </p>
            <p className="font-semibold text-destructive">
              If you do not agree to these Terms, you must not access or use the Services.
            </p>
            <p>
              If you accept these Terms on behalf of an organization, you represent that you have authority to bind that organization. Your use of the Services is also subject to our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">1. Description of the Services</h2>
            <p>
              Dataomen provides a cloud-based analytical Software-as-a-Service (SaaS) platform designed to help users ingest, process, analyze, and visualize complex datasets.
            </p>
            <p className="font-semibold mt-4">The Services may include:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Natural-language-to-SQL systems</li>
              <li>AI-generated analytical narratives</li>
              <li>Data visualization engines</li>
              <li>Vectorized execution pipelines</li>
              <li>Embedded analytical query engines (such as DuckDB)</li>
              <li>Third-party data integrations</li>
              <li>Cloud data storage and synchronization tools</li>
              <li>AI-powered semantic query routing</li>
            </ul>
            <p className="font-semibold mt-4">Users may connect external data sources including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>e-commerce platforms</li>
              <li>CRM platforms</li>
              <li>financial platforms</li>
              <li>databases</li>
              <li>APIs</li>
            </ul>
            <p className="mt-4">The Services provide analytical tools only.</p>
            
            <h3 className="text-xl font-semibold mt-6">No Guarantee of Business Outcomes</h3>
            <p>Dataomen does not guarantee that use of the Services will result in:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>increased revenue</li>
              <li>improved operational performance</li>
              <li>financial gains</li>
              <li>correct predictions or insights</li>
            </ul>
            <p className="mt-4 font-medium">All analytics, metrics, and visualizations generated through the Services are informational only.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">2. Eligibility</h2>
            <p>To use the Services, you must:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>be at least 18 years old</li>
              <li>have the legal capacity to enter a binding contract</li>
            </ul>
            <p className="mt-4">If you use the Services on behalf of an organization, you represent that you have authority to bind that organization.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">3. Accounts and Registration</h2>
            <p>To access certain features, you must create an account. You agree to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>provide accurate registration information</li>
              <li>maintain the confidentiality of your credentials</li>
              <li>promptly notify Dataomen of unauthorized account access</li>
            </ul>
            <p className="mt-4">You are responsible for all activity occurring under your account. Dataomen may suspend or terminate accounts suspected of unauthorized activity.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">4. Infrastructure Architecture</h2>
            <p>The Services operate on distributed cloud infrastructure which may include providers such as:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Vercel</li>
              <li>Render</li>
              <li>Cloudflare</li>
              <li>Supabase</li>
              <li>cloud object storage services</li>
            </ul>
            <p className="mt-4 font-semibold">Customer data is isolated through:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>tenant partitioning</li>
              <li>authentication systems</li>
              <li>row-level security policies</li>
            </ul>
            <p className="mt-4">By using the Services, you consent to processing of data within such distributed infrastructure.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">5. Billing and Payment</h2>
            <p>
              Certain features of the Services may require payment. Payments may be processed through third-party payment providers. All prices displayed are exclusive of applicable taxes.
            </p>
            <p className="mt-2">
              You agree to pay all applicable charges and taxes associated with your use of the Services. Dataomen reserves the right to modify pricing at any time.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">6. Compute Credits and Usage</h2>
            <p>Subscriptions may include compute credits used for platform operations including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>analytical queries</li>
              <li>AI inference</li>
              <li>data processing</li>
              <li>synchronization operations</li>
              <li>storage scans</li>
            </ul>
            <p className="font-semibold mt-4">Compute credits:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>have no cash value</li>
              <li>are non-transferable</li>
              <li>are non-refundable</li>
              <li>may expire at the end of the billing cycle</li>
            </ul>
            <p className="font-semibold mt-4">Dataomen may implement:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>rate limiting</li>
              <li>compute throttling</li>
              <li>workload queuing</li>
            </ul>
            <p className="mt-2">to protect infrastructure stability.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">7. AI Functions</h2>
            <p>The Services may include artificial intelligence capabilities such as:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>natural language query generation</li>
              <li>AI-generated SQL</li>
              <li>automated insights</li>
              <li>narrative generation</li>
              <li>visualization suggestions</li>
            </ul>
            <p className="mt-4">
              Users provide Inputs (data and prompts) and receive Outputs generated by AI systems. You retain ownership of your data and outputs. However, Dataomen retains all rights to the AI systems, algorithms, and infrastructure used to generate outputs.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4 text-destructive">8. AI Limitations and Hallucination Disclaimer</h2>
            <div className="bg-destructive/10 p-6 rounded-lg border border-destructive/20">
              <p className="font-semibold mb-2">Artificial intelligence systems may generate:</p>
              <ul className="list-disc pl-6 space-y-1 mb-4">
                <li>incorrect outputs</li>
                <li>inaccurate analytics</li>
                <li>flawed SQL queries</li>
                <li>misleading narratives</li>
              </ul>
              <p className="font-bold mb-4">Outputs may not always be correct or reliable.</p>
              <p className="font-semibold mb-2">You acknowledge that:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>AI outputs are informational only</li>
                <li>you are responsible for validating results</li>
                <li>you must independently verify outputs before making decisions</li>
              </ul>
              <p className="mt-4 font-bold">Dataomen shall not be liable for decisions made based on AI outputs.</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">9. User Generated Content</h2>
            <p>You may upload or synchronize data through the Services. User Generated Content includes:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>uploaded files</li>
              <li>datasets</li>
              <li>database connections</li>
              <li>prompts</li>
              <li>API-imported data</li>
            </ul>
            <p>You retain ownership of your content. You grant Dataomen a limited license to:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>store</li>
              <li>process</li>
              <li>analyze</li>
              <li>display</li>
            </ul>
            <p className="font-medium">
              your data solely to provide the Services. Dataomen does not use customer data to train cross-tenant AI models.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">10. Acceptable Use Policy</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>reverse engineer the platform</li>
              <li>attempt to access other tenants&apos; data</li>
              <li>bypass security protections</li>
              <li>run cryptocurrency mining workloads</li>
              <li>execute infrastructure-abusing scripts</li>
              <li>upload malicious software</li>
              <li>upload illegal data</li>
            </ul>
            <p className="mt-4 font-semibold text-destructive">Violations may result in account suspension or termination.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">11. Third-Party Integrations</h2>
            <p>The Services may integrate with third-party services. Dataomen does not control these services and is not responsible for:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>outages</li>
              <li>API changes</li>
              <li>rate limits</li>
              <li>data inaccuracies</li>
              <li>security breaches</li>
            </ul>
            <p className="mt-4">Your use of third-party services is subject to their own terms.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">12. Intellectual Property Rights</h2>
            <p>All platform technology is owned by Dataomen or its licensors. This includes:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>software</li>
              <li>algorithms</li>
              <li>infrastructure architecture</li>
              <li>UI designs</li>
              <li>trademarks</li>
              <li>documentation</li>
            </ul>
            <p className="mt-4">
              You receive a limited license to access the Services. You may not copy, distribute, sell, or create derivative works from the platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">13. Confidential Information</h2>
            <p>You agree not to disclose or misuse any confidential information relating to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>platform architecture</li>
              <li>proprietary algorithms</li>
              <li>internal technical systems</li>
              <li>business operations</li>
            </ul>
            <p className="mt-4">This obligation survives termination of the Services.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">14. Suspension and Termination</h2>
            <p>Dataomen may suspend or terminate access if:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>these Terms are violated</li>
              <li>payment obligations are not met</li>
              <li>infrastructure abuse occurs</li>
              <li>required by law</li>
            </ul>
            <p className="mt-4">You may cancel your account at any time.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">15. Data Retention and Deletion</h2>
            <p>Upon termination:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>data may remain available for up to 30 days</li>
              <li>after this period, data may be permanently deleted</li>
            </ul>
            <p className="mt-4 font-semibold">Deleted data cannot be recovered. Unused credits are forfeited.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">16. Disclaimer of Warranties</h2>
            <p className="font-bold uppercase tracking-wide">The Services are provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo;</p>
            <p className="mt-4">Dataomen disclaims all warranties including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>merchantability</li>
              <li>fitness for a particular purpose</li>
              <li>non-infringement</li>
            </ul>
            <p className="mt-4">Dataomen does not guarantee uptime or uninterrupted service.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">17. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, Dataomen shall not be liable for:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>lost profits</li>
              <li>loss of revenue</li>
              <li>data loss</li>
              <li>business interruption</li>
              <li>indirect damages</li>
            </ul>
            <p className="mt-4 font-semibold">Total liability shall not exceed the greater of:</p>
            <ul className="list-disc pl-6 space-y-1 font-semibold">
              <li>fees paid in the prior six months</li>
              <li>$100 USD</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">18. Indemnification</h2>
            <p>You agree to indemnify and hold harmless Dataomen from claims arising from:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>your use of the Services</li>
              <li>violations of these Terms</li>
              <li>violations of applicable laws</li>
              <li>infringement caused by your data or content</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">19. Data Protection Compliance</h2>
            <p>You agree that all data uploaded through the Services complies with applicable data protection laws including:</p>
            <ul className="list-disc pl-6 space-y-1 font-semibold mb-4">
              <li>UAE Personal Data Protection Law (PDPL)</li>
            </ul>
            <p>
              You represent that you have obtained all necessary permissions to process personal data. Dataomen is not responsible for unlawful data submitted by users.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">20. Export Control and Sanctions</h2>
            <p>You agree not to use the Services in violation of export control or sanctions laws. You represent that you are not:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>located in sanctioned jurisdictions</li>
              <li>listed on restricted party lists</li>
            </ul>
            <p className="mt-4">Dataomen may terminate access to comply with legal obligations.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">21. Infrastructure and Security Limitations</h2>
            <p>
              The Services rely on third-party infrastructure providers. While reasonable security measures are implemented, no system is completely secure. Dataomen shall not be liable for incidents caused by external infrastructure providers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">22. Beta Features</h2>
            <p>Dataomen may offer experimental or beta features. These features:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>may contain bugs</li>
              <li>may change or be discontinued</li>
              <li>are provided without warranties</li>
            </ul>
            <p className="mt-4 font-semibold">Use of beta features is at your own risk.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">23. Dispute Resolution</h2>
            <p>
              Before initiating legal proceedings, parties agree to attempt informal resolution for 30 days. If unresolved, disputes may be resolved through arbitration or competent courts.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">24. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the United Arab Emirates. Any disputes shall be subject to the jurisdiction of the courts of Ras Al Khaimah.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">25. Changes to the Terms</h2>
            <p>
              Dataomen may update these Terms at any time. Continued use of the Services after changes constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">26. Entire Agreement</h2>
            <p>
              These Terms constitute the entire agreement between you and Dataomen regarding the Services. If any provision is unenforceable, the remaining provisions remain valid.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">27. Contact Information</h2>
            <p>If you have questions regarding these Terms, contact:</p>
            <address className="not-italic mt-4 p-6 bg-muted rounded-lg border border-border">
              <strong>Email:</strong> <a href="mailto:legal@dataomen.com" className="text-primary hover:underline">legal@dataomen.com</a><br /><br />
              <strong>Address:</strong><br />
              Dataomen Inc.<br />
              Ras Al Khaimah<br />
              United Arab Emirates
            </address>
          </section>
        </article>
      </div>
    </div>
  );
}