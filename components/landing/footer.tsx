import React from 'react';
import Link from 'next/link';
import { 
  Twitter, 
  Github, 
  Linkedin, 
  Mail, 
  ArrowRight
} from 'lucide-react';
import Logo from '@/components/ui/logo';

const SUPPORT_EMAIL = 'support@arcli.tech';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white text-gray-600 py-16 md:py-24 border-t border-gray-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        
        {/* Top Section: Brand & Newsletter / CTA */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-8 mb-16">
          
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 text-gray-900 mb-6 group">
              {/* Removed the text span since the Logo already contains "Arcli" */}
              <Logo className="h-8 w-auto group-hover:scale-105 transition-transform" />
            </Link>
            <p className="text-gray-600 mb-8 max-w-md leading-relaxed">
              The AI data analyst for modern teams. Stop writing SQL and wrestling with Excel. 
              Ask questions in plain English, get instant charts, and deploy agents securely.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://twitter.com" target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-[#1DA1F2] hover:text-white transition-colors shadow-sm">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="https://github.com/dataomen" target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-900 hover:text-white transition-colors shadow-sm">
                <Github className="w-4 h-4" />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-[#0A66C2] hover:text-white transition-colors shadow-sm">
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Link Columns */}
          <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-8">
            
            {/* Column 1: Core Platform (SEO Hub) */}
            <div>
              <h3 className="text-gray-900 font-bold mb-6 tracking-wide text-sm">Platform</h3>
              <ul className="space-y-4">
                <li>
                  <Link href="/ai-data-analysis" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Conversational BI
                  </Link>
                </li>
                <li>
                  <Link href="/ai-dashboard-builder" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Automated Dashboards
                  </Link>
                </li>
                <li>
                  <Link href="/predictive-ai-analytics" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Predictive Analytics
                  </Link>
                </li>
                <li>
                  <Link href="/ai-excel-analysis" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    AI Excel Analysis
                  </Link>
                </li>
                <li>
                  <Link href="/json-data-analysis-ai" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    JSON & API Parser
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 2: Integrations (SEO Hub) */}
            <div>
              <h3 className="text-gray-900 font-bold mb-6 tracking-wide text-sm">Integrations</h3>
              <ul className="space-y-4">
                <li>
                  <Link href="/analyze-shopify-data" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Shopify Analytics
                  </Link>
                </li>
                <li>
                  <Link href="/analyze-salesforce-data" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Salesforce Intelligence
                  </Link>
                </li>
                <li>
                  <Link href="/slack-teams-data-bot" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Slack Data Bot
                  </Link>
                </li>
                <li>
                  <Link href="/embedded-analytics-api" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Embedded SaaS API
                  </Link>
                </li>
                <li>
                  <Link href="/integrations" className="text-sm text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-1 group">
                    View All Connectors 
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3: Resources & Legal */}
            <div className="col-span-2 md:col-span-1 grid grid-cols-2 md:grid-cols-1 gap-8">
              <div>
                <h3 className="text-gray-900 font-bold mb-6 tracking-wide text-sm">Resources</h3>
                <ul className="space-y-4">
                  <li>
                    <Link href="/chat/demo" className="text-sm text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-2">
                      Interactive Demo
                      <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded font-bold">NEW</span>
                    </Link>
                  </li>
                  <li>
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                      Contact Support
                    </a>
                  </li>
                  <li>
                    <Link href="/register" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                      Start for Free
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-gray-900 font-bold mb-6 tracking-wide text-sm">Legal</h3>
                <ul className="space-y-4">
                  <li>
                    <Link href="/privacy" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                      Privacy Policy
                    </Link>
                  </li>
                  <li>
                    <Link href="/terms" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                      Terms of Service
                    </Link>
                  </li>
                  <li>
                    <Link href="/security" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                      Security & GDPR
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom Section: Copyright */}
        <div className="pt-8 border-t border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            &copy; {currentYear} Arcli Analytics. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              All Systems Operational
            </span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-gray-900 transition-colors flex items-center gap-2">
              <Mail className="w-4 h-4" />
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}