"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dashboardNavigationItems } from "@/lib/dashboard-navigation";

type DashboardSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPro: boolean;
  assistedPilot: boolean;
};

export function DashboardSearch({ open, onOpenChange, isPro, assistedPilot }: DashboardSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const pages = useMemo(() => {
    const items = assistedPilot
      ? [dashboardNavigationItems[0], { href: "/dashboard/today", label: "Today's prospects", description: "Review delivered prospect files." }, ...dashboardNavigationItems.slice(1)]
      : dashboardNavigationItems;
    return items.filter((item) => (isPro || item.href !== "/dashboard/watchlists") && `${item.label} ${item.description}`.toLowerCase().includes(query.toLowerCase().trim()));
  }, [assistedPilot, isPro, query]);

  const goTo = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setQuery(""); }}>
      <DialogContent className="max-w-lg overflow-hidden border-[#DDE8F2] bg-white p-0">
        <DialogHeader className="sr-only"><DialogTitle>Go to a workspace page</DialogTitle></DialogHeader>
        <div className="flex items-center gap-3 border-b border-[#DDE8F2] px-4"><Search className="size-4 text-[#546F8A]" /><input autoFocus className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Find a workspace page" aria-label="Find a workspace page" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && pages[0]) goTo(pages[0].href); }} /></div>
        <div className="max-h-80 overflow-y-auto p-2">
          {pages.length ? pages.map((page) => <button key={page.href} type="button" onClick={() => goTo(page.href)} className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-[#F0F7FF] focus-visible:bg-[#F0F7FF] focus-visible:outline-none"><strong className="text-sm text-[#0A1628]">{page.label}</strong><span className="text-xs text-[#546F8A]">{page.description}</span></button>) : <p className="p-4 text-sm text-[#546F8A]">No matching page.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
