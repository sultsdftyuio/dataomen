import React from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import Logo from '@/components/ui/logo';

const SUPPORT_EMAIL = 'support@arcli.tech';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="bg-white text-gray-600 py-16 md:py-24 border-t"
      style={{ 
        borderColor: "rgba(27,110,191,0.16)", 
        fontFamily: "var(--font-geist-sans), sans-serif", 
        background: "linear-gradient(180deg, #FFFFFF 0%, #F6FAFE 100%)" 
      }}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        
        {/* Main Footer Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-8 mb-16">
          
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 text-gray-900 mb-6 group">
              <Logo className="h-7 w-auto group-hover:scale-[1.02] transition-transform" />
            </Link>
            <p className="text-slate-600 mb-6 max-w-md text-[14px] leading-relaxed">
              Arcli helps SaaS founders find people already talking about the problem they solve. It learns from your website, checks each match, and sends only useful opportunities.
            </p>
          </div>

          {/* Nav Links Grid */}
          <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-8">
            
            {/* Column 1: Core Systems */}
            <div>
              <h3 className="text-gray-900 font-semibold mb-4 tracking-[0.08em] text-xs uppercase">Platform</h3>
              <ul className="space-y-3">
                <li>
                  <Link href="/saas-churn-recovery" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Find Prospects
                  </Link>
                </li>
                <li>
                  <Link href="/saas-churn-risk-scoring" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Quality Checks
                  </Link>
                </li>
                <li>
                  <Link href="/saas-dunning-software" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Prospect Alerts
                  </Link>
                </li>
                <li>
                  <Link href="/saas-revenue-attribution" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Useful Alerts
                  </Link>
                </li>
                <li>
                  <Link href="/saas-billing-infrastructure" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Website Setup
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 2: Operations */}
            <div>
              <h3 className="text-gray-900 font-semibold mb-4 tracking-[0.08em] text-xs uppercase">App Portal</h3>
              <ul className="space-y-3">
                <li>
                  <Link href="/register" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Create Workspace
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Founder Login
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Prospect Inbox
                  </Link>
                </li>
                <li>
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Product Support
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 3: Trust & Governance */}
            <div>
              <h3 className="text-gray-900 font-semibold mb-4 tracking-[0.08em] text-xs uppercase">Compliance</h3>
              <ul className="space-y-3">
                <li>
                  <Link href="/security" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Security Architecture
                  </Link>
                </li>
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
                  <Link href="/cookies" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    Cookie Declaration
                  </Link>
                </li>
              </ul>
            </div>

          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-8 border-t flex flex-col md:flex-row items-center justify-between gap-4" style={{ borderColor: "rgba(27,110,191,0.16)" }}>
          <p className="text-sm text-slate-500">
            &copy; {currentYear} Arcli. All rights reserved. Prospect Finder for SaaS.
          </p>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-[#1B6EBF] transition-colors flex items-center gap-2 font-medium text-slate-600">
              <Mail className="w-4 h-4" />
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}
