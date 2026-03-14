// app/(landing)/cookies/page.tsx

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Cookie Policy | Dataomen",
  description: "Information on how Dataomen uses cookies, local storage, and tracking technologies.",
};

export default function CookiePolicyPage() {
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
            Dataomen Cookie Policy
          </h1>
          <div className="flex flex-col sm:flex-row sm:gap-6 text-lg text-muted-foreground">
            <p>
              Last Updated: <span className="font-semibold text-foreground">March 14, 2026</span>
            </p>
          </div>
        </header>

        {/* Content */}
        <article className="prose prose-slate dark:prose-invert max-w-none space-y-8">
          <section className="lead text-lg">
            <p>
              This Cookie Policy explains how Dataomen Inc. (&ldquo;Dataomen,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) uses cookies, local storage, session storage, and similar tracking technologies when you visit our website or use our cloud-based analytical SaaS platform (the &ldquo;Services&rdquo;).
            </p>
            <p>
              As an enterprise data platform, we prioritize your privacy and security. <strong>Dataomen does not use third-party advertising, retargeting, or cross-site tracking cookies within our authenticated dashboard.</strong> We utilize tracking technologies strictly to authenticate users, protect our infrastructure, process secure payments, and maintain your application interface preferences.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">1. What Are Cookies and Tracking Technologies?</h2>
            <p>
              A cookie is a small text file downloaded onto your device (computer, tablet, or smartphone) when you access a website. Alongside cookies, modern web applications like Dataomen use <strong>Local Storage</strong> and <strong>Session Storage</strong> (Web Storage API) to store data directly in your browser.
            </p>
            <p className="mt-4">
              These technologies allow our React-based frontend to "remember" your authentication state, route your requests securely to our backend execution pipelines, and apply your visual preferences without requiring you to repeatedly configure them.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">2. Categories of Technologies We Use</h2>
            <p>We classify the tracking technologies used on the Dataomen platform into the following categories:</p>

            <h3 className="text-xl font-semibold mt-6 mb-2">A. Strictly Necessary (Essential)</h3>
            <p>These technologies are absolutely essential for the Services to function securely and cannot be switched off in our systems. They are usually set in response to actions made by you, such as logging in or filling in forms.</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Supabase Authentication:</strong> We store cryptographically secure JSON Web Tokens (JWTs) and session identifiers in cookies and local storage. These ensure that your API requests are authorized and that your Row-Level Security (RLS) tenant isolation context is strictly maintained.</li>
              <li><strong>Cloudflare Security:</strong> Our Edge network provider (Cloudflare) places functional cookies (such as <code>__cf_bm</code>) to mitigate distributed denial-of-service (DDoS) attacks, manage our Web Application Firewall (WAF), and distinguish between human users and malicious bots.</li>
              <li><strong>Stripe Fraud Prevention:</strong> When you access our billing portal, Stripe sets essential cookies (such as <code>__stripe_mid</code>) strictly to process payments securely and detect fraudulent transactions.</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-2">B. Functional and User Interface (UI) State</h3>
            <p>These technologies enable the platform to provide enhanced functionality, modularity, and personalization. They allow our declarative React components to remember your layout choices.</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Theme Preferences:</strong> We use local storage to remember if you prefer the &ldquo;Dark&rdquo; or &ldquo;Light&rdquo; visual theme to prevent screen flashing upon navigation.</li>
              <li><strong>Dashboard Configuration:</strong> Local storage is utilized to remember the state of your collapsible sidebar, the arrangement of your dynamic chart factories, and your recent semantic query drafts.</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-2">C. Performance and Telemetry</h3>
            <p>These technologies allow us to monitor the engineering health of our platform, measure API latency, and track computational pipeline performance.</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>System Diagnostics:</strong> We collect anonymized telemetry regarding page load times, DuckDB query execution speeds, and integration sync statuses. This data is aggregated and used exclusively by our engineering team to optimize vectorization logic and frontend responsiveness.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4 text-primary">3. No Advertising or Marketing Trackers</h2>
            <div className="bg-primary/5 border border-primary/20 p-6 rounded-lg text-foreground">
              <p className="font-bold uppercase tracking-wider mb-2">
                Enterprise Data Privacy Commitment
              </p>
              <p>
                To maintain the strictest security protocols for our multi-tenant architecture, <strong>Dataomen explicitly prohibits the use of third-party advertising cookies, Facebook Pixels, Google Ads trackers, or cross-site retargeting scripts</strong> within the authenticated dashboard environments (<code>/dashboard</code>, <code>/agents</code>, <code>/datasets</code>, etc.). 
              </p>
              <p className="mt-4">
                Your interaction with your proprietary Customer Data is never monitored for marketing purposes.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">4. How to Manage Your Cookie Preferences</h2>
            <p>
              Because the tracking technologies utilized within the Dataomen SaaS platform are <strong>Strictly Necessary</strong> for authentication, security (Cloudflare WAF), and fundamental UI functionality, opting out of them will render the platform unusable. 
            </p>
            <p className="mt-4">
              However, you have the right to control how your browser handles these files:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Browser Settings:</strong> You can set your browser to refuse all or some browser cookies or to alert you when websites set or access cookies. If you disable or refuse cookies, please note that you will be unable to log in via Supabase, and the application will fail to load.</li>
              <li><strong>Clearing Local Storage:</strong> You can manually clear your browser&apos;s Local Storage and Session Storage at any time. Doing so will log you out of Dataomen and reset your visual preferences (e.g., reverting to the default UI theme).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">5. Updates to This Policy</h2>
            <p>
              We may update this Cookie Policy from time to time to reflect changes in our technology stack (such as adopting new Next.js caching behaviors or changes in our authentication providers). Any changes will become effective when we post the revised Cookie Policy on this page. We encourage you to review this page periodically for the latest information on our privacy practices.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mt-10 mb-4">6. Contact Us</h2>
            <p>
              If you have any questions, concerns, or technical inquiries regarding our use of cookies and local storage, please contact our Data Protection and Engineering teams:
            </p>
            <address className="not-italic mt-6 p-6 bg-muted rounded-lg border border-border">
              <strong>Email:</strong> <a href="mailto:legal@dataomen.com" className="text-primary hover:underline font-medium">legal@dataomen.com</a><br /><br />
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