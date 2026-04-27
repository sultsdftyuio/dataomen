"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bot,
  CalendarClock,
  CreditCard,
  Database,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Settings,
} from "lucide-react";

import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ChatSessionSummary, GroupedChatSessions } from "@/lib/chat-history";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Chat", href: "/chat", icon: MessageSquare },
  { name: "Datasets", href: "/datasets", icon: Database },
  { name: "Agents", href: "/agents", icon: Bot },
];

const footerItems = [
  { name: "Billing", href: "/billing", icon: CreditCard },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface DashboardSidebarClientProps {
  groupedSessions: GroupedChatSessions;
}

function SessionSection({
  label,
  sessions,
  activeSessionId,
  state,
}: {
  label: string;
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  state: "expanded" | "collapsed";
}) {
  if (sessions.length === 0 || state === "collapsed") {
    return null;
  }

  return (
    <div className="space-y-1">
      <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <SidebarMenu>
        {sessions.slice(0, 12).map((session) => {
          const isActive = activeSessionId === session.id;
          return (
            <SidebarMenuItem key={session.id}>
              <SidebarMenuButton asChild isActive={isActive} tooltip={session.title}>
                <Link
                  href={`/chat?session=${encodeURIComponent(session.id)}`}
                  className="flex items-center gap-2.5"
                >
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-[13px] font-medium">{session.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </div>
  );
}

export function DashboardSidebarClient({ groupedSessions }: DashboardSidebarClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useSidebar();

  const activeSessionId = pathname === "/chat" ? searchParams.get("session") : null;
  const hasSessions =
    groupedSessions.today.length > 0 ||
    groupedSessions.yesterday.length > 0 ||
    groupedSessions.previous7Days.length > 0;

  return (
    <Sidebar collapsible="icon" className="border-r border-slate-200/80 bg-white">
      <SidebarHeader className="h-16 flex-shrink-0 border-b border-slate-200/70 bg-white/95 px-2">
        <Link
          href="/dashboard"
          className={cn(
            "group flex h-full w-full items-center overflow-hidden rounded-xl px-2.5 transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:translate-x-[1px] hover:bg-slate-100/80 motion-reduce:transform-none",
            state === "collapsed" ? "justify-center" : "gap-2.5",
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-px group-hover:bg-slate-200/70 motion-reduce:transform-none">
            <Logo iconOnly className="!gap-0 [&_svg]:h-7 [&_svg]:w-7" />
          </span>
          <span
            className={cn(
              "origin-left truncate text-[15px] font-semibold tracking-tight text-slate-900 transition-[width,opacity,transform] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none",
              state === "expanded" ? "w-auto translate-x-0 opacity-100" : "w-0 -translate-x-1 opacity-0",
            )}
          >
            Arcli
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="custom-scrollbar flex flex-1 flex-col overflow-x-hidden overflow-y-auto pt-4">
        <SidebarGroup>
          <SidebarGroupLabel
            className={
              state === "collapsed"
                ? "sr-only"
                : "mb-2 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400"
            }
          >
            Platform
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.name}
                      className="transition-all duration-300"
                    >
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center overflow-hidden transition-[gap,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none",
                          state === "collapsed" ? "justify-center gap-0" : "gap-3",
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span
                          className={cn(
                            "truncate transition-[width,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none",
                            state === "expanded"
                              ? "w-auto translate-x-0 opacity-100"
                              : "w-0 -translate-x-1 opacity-0",
                          )}
                        >
                          {item.name}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel
            className={
              state === "collapsed"
                ? "sr-only"
                : "mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400"
            }
          >
            Recent Chats
          </SidebarGroupLabel>
          <SidebarGroupContent className="space-y-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="New chat">
                  <Link href="/chat" className="flex items-center gap-2.5">
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span
                      className={cn(
                        "truncate transition-[width,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none",
                        state === "expanded"
                          ? "w-auto translate-x-0 opacity-100"
                          : "w-0 -translate-x-1 opacity-0",
                      )}
                    >
                      New chat
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            {!hasSessions && state === "expanded" && (
              <p className="px-2 text-[12px] text-slate-400">No recent sessions yet.</p>
            )}

            <SessionSection
              label="Today"
              sessions={groupedSessions.today}
              activeSessionId={activeSessionId}
              state={state}
            />
            <SessionSection
              label="Yesterday"
              sessions={groupedSessions.yesterday}
              activeSessionId={activeSessionId}
              state={state}
            />
            <SessionSection
              label="Previous 7 Days"
              sessions={groupedSessions.previous7Days}
              activeSessionId={activeSessionId}
              state={state}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="flex-shrink-0 border-t border-slate-200/70 bg-white/95 p-2">
        <SidebarMenu>
          {footerItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <SidebarMenuItem key={item.name}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.name}
                  className="transition-all duration-300"
                >
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center overflow-hidden transition-[gap,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none",
                      state === "collapsed" ? "justify-center gap-0" : "gap-3",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span
                      className={cn(
                        "truncate transition-[width,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none",
                        state === "expanded"
                          ? "w-auto translate-x-0 opacity-100"
                          : "w-0 -translate-x-1 opacity-0",
                      )}
                    >
                      {item.name}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
