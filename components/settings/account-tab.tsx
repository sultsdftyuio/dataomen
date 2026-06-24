"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, AlertTriangle, Send, Settings } from "lucide-react";

import Logo from "@/components/ui/logo";
import UpgradeButton from "@/components/ui/UpgradeButton";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navLinks = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/queue", label: "Risk Queue", icon: AlertTriangle },
    { href: "/dashboard/campaigns", label: "Campaigns", icon: Send },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-slate-900 animate-in fade-in duration-300">
      
      {/* Top Navigation Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="w-full px-6 h-16 flex items-center justify-between max-w-[1600px] mx-auto">
          
          {/* Brand & Main Nav */}
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="shrink-0 hover:opacity-90 transition-opacity">
              <Logo />
            </Link>
            
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
                
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      isActive 
                        ? "bg-slate-100 text-[#0A192F] shadow-sm" 
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? "text-blue-500" : "text-slate-400"}`} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Revenue & Settings Actions (Avatar and Logout Removed) */}
          <div className="flex items-center gap-4">
            
            {/* Contextual Upgrade CTA */}
            <div className="shrink-0">
               <UpgradeButton />
            </div>

            <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

            {/* Settings Link */}
            <Link 
              href="/settings" 
              className={`p-2 transition-all duration-200 rounded-full ${
                pathname.startsWith("/settings") 
                  ? "bg-slate-100 text-[#0A192F] shadow-sm" 
                  : "text-slate-400 hover:text-[#0A192F] hover:bg-slate-100"
              }`}
              title="Workspace Settings"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Render Area */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto overflow-y-auto">
        {children}
      </main>
    </div>
  );
}