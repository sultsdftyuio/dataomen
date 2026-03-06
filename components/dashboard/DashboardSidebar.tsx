"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  MessageSquare, 
  BookText, 
  Files, 
  Database, 
  Bot, 
  PlusCircle, 
  Cable, 
  LayoutTemplate,
  MessageCircle,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const mainNavItems = [
  { href: "/dashboard/chats", label: "Chats", icon: MessageSquare },
  { href: "/dashboard/notebooks", label: "Notebooks", icon: BookText },
  { href: "/dashboard/files", label: "Files", icon: Files },
  { href: "/dashboard/connectors", label: "Data Connectors", icon: Database },
  { href: "/dashboard/agents", label: "Custom Agents", icon: Bot, badge: "Try" },
];

const secondaryNavItems = [
  { href: "/dashboard/connect", label: "Connect your data", icon: Cable },
  { href: "/dashboard/templates", label: "Notebook Templates", icon: LayoutTemplate },
  { href: "https://slack.com", label: "Community Slack", icon: MessageCircle, external: true },
];

export default function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-background border-r h-screen flex flex-col p-4 text-sm shrink-0">
      {/* Profile / Account Area */}
      <div className="flex items-center space-x-3 mb-6 px-1 cursor-pointer hover:opacity-80 transition-opacity">
        <Avatar className="h-8 w-8">
          <AvatarImage src="/placeholder-user.jpg" />
          <AvatarFallback className="bg-primary/10 text-primary">SM</AvatarFallback>
        </Avatar>
        <span className="font-medium truncate text-foreground">sultan2026mon@gmail.com</span>
      </div>

      {/* New Action Button */}
      <Button className="w-full justify-start gap-2 mb-6" variant="default">
        <PlusCircle className="h-4 w-4" />
        New
      </Button>

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-col gap-1 overflow-y-auto pr-2 custom-scrollbar">
        {mainNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                isActive 
                  ? "bg-secondary text-foreground font-medium" 
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-4 w-4" />
                {item.label}
              </div>
              {item.badge && (
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        <div className="my-4 border-t border-border" />

        {/* Secondary Navigation */}
        {secondaryNavItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer" : undefined}
            className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-foreground rounded-md transition-colors hover:bg-secondary/50"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Usage & Upgrade Area */}
      <div className="mt-auto pt-4 border-t border-border">
        <div className="px-2 mb-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground font-medium">
            <span>5 messages left</span>
          </div>
          {/* Assumes a 5/100 scale for visual impact, adjust as needed */}
          <Progress value={5} className="h-1.5 bg-secondary" />
          <p className="text-[11px] text-muted-foreground leading-tight">
            Upgrade for unlimited usage
          </p>
        </div>
        <Button 
          variant="default" 
          className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 border-0 text-white shadow-md transition-all hover:shadow-lg"
        >
          <Zap className="h-4 w-4 fill-current" />
          Upgrade
        </Button>
      </div>
    </aside>
  );
}