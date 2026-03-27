// components/landing/footer.tsx
import React from 'react';
import Link from 'next/link';
import { 
  Twitter, 
  Github, 
  Linkedin, 
  Mail, 
  Layers, 
  ArrowRight
} from 'lucide-react';

const SUPPORT_EMAIL = 'support@arcli.tech';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-zinc-950 text-zinc-400 py-16 md:py-24 border-t border-zinc-900">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        
        {/* Top Section: Brand & Newsletter / CTA */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-8 mb-16">
          
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 text-white mb-6">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <Layers className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-bold tracking-tight">Arcli.</span>
            </Link>
            <p className="text-zinc-400 mb-8 max-w-md leading-relaxed">
              The AI data analyst for modern teams. Stop writing SQL and wrestling with Excel. 
              Ask questions in plain English, get instant charts, and deploy agents securely.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://twitter.com" target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="https://github.com/dataomen" target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center hover:bg-zinc-700 hover:text-white transition-colors">
                <Github className="w-4 h-4" />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center hover:bg-blue-700 hover:text-white transition-colors">
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Link Columns */}
          <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-8">
            
            {/* Column 1: Core Platform (SEO Hub) */}
            <div>
              <h3 className="text-white font-bold mb-6 tracking-wide text-sm">Platform</h3>
              <ul className="space-y-4">
                <li>
                  <Link href="/ai-data-analysis" className="hover:text-blue-400 transition-colors text-sm">
                    Conversational BI
                  </Link>
                </li>
                <li>
                  <Link href="/ai-dashboard-builder" className="hover:text-blue-400 transition-colors text-sm">
                    Automated Dashboards
                  </Link>
                </li>
                <li>
                  <Link href="/predictive-ai-analytics" className="hover:text-blue-400 transition-colors text-sm">
                    Predictive Analytics
                  </Link>
                </li>
                <li>
                  <Link href="/ai-excel-analysis" className="hover:text-blue-400 transition-colors text-sm">
                    AI Excel Analysis
                  </Link>
                </li>
                <li>
                  <Link href="/json-data-analysis-ai" className="hover:text-blue-400 transition-colors text-sm">
                    JSON & API Parser
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 2: Integrations (SEO Hub) */}
            <div>
              <h3 className="text-white font-bold mb-6 tracking-wide text-sm">Integrations</h3>
              <ul className="space-y-4">
                <li>
                  <Link href="/analyze-shopify-data" className="hover:text-blue-400 transition-colors text-sm">
                    Shopify Analytics
                  </Link>
                </li>
                <li>
                  <Link href="/analyze-salesforce-data" className="hover:text-blue-400 transition-colors text-sm">
                    Salesforce Intelligence
                  </Link>
                </li>
                <li>
                  <Link href="/slack-teams-data-bot" className="hover:text-blue-400 transition-colors text-sm">
                    Slack Data Bot
                  </Link>
                </li>
                <li>
                  <Link href="/embedded-analytics-api" className="hover:text-blue-400 transition-colors text-sm">
                    Embedded SaaS API
                  </Link>
                </li>
                <li>
                  <Link href="/integrations" className="hover:text-blue-400 transition-colors text-sm flex items-center gap-1 group">
                    View All Connectors 
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3: Resources & Legal */}
            <div className="col-span-2 md:col-span-1 grid grid-cols-2 md:grid-cols-1 gap-8">
              <div>
                <h3 className="text-white font-bold mb-6 tracking-wide text-sm">Resources</h3>
                <ul className="space-y-4">
                  <li>
                    <Link href="/chat/demo" className="hover:text-blue-400 transition-colors text-sm flex items-center gap-2">
                      Interactive Demo
                      <span className="bg-blue-600/20 text-blue-400 text-[10px] px-2 py-0.5 rounded font-bold">NEW</span>
                    </Link>
                  </li>
                  <li>
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-blue-400 transition-colors text-sm">
                      Contact Support
                    </a>
                  </li>
                  <li>
                    <Link href="/register" className="hover:text-blue-400 transition-colors text-sm">
                      Start for Free
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-white font-bold mb-6 tracking-wide text-sm">Legal</h3>
                <ul className="space-y-4">
                  <li>
                    <Link href="/privacy" className="hover:text-blue-400 transition-colors text-sm">
                      Privacy Policy
                    </Link>
                  </li>
                  <li>
                    <Link href="/terms" className="hover:text-blue-400 transition-colors text-sm">
                      Terms of Service
                    </Link>
                  </li>
                  <li>
                    <Link href="/security" className="hover:text-blue-400 transition-colors text-sm">
                      Security & GDPR
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom Section: Copyright */}
        <div className="pt-8 border-t border-zinc-900 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-zinc-500">
            &copy; {currentYear} Arcli Analytics. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              All Systems Operational
            </span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-white transition-colors flex items-center gap-2">
              <Mail className="w-4 h-4" />
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}