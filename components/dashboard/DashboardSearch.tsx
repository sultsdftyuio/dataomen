"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dashboardNavigationItemsFor } from "@/lib/dashboard-navigation";

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
    const items = dashboardNavigationItemsFor(assistedPilot);
    return items.filter((item) => (isPro || item.href !== "/dashboard/watchlists") && `${item.label} ${item.description}`.toLowerCase().includes(query.toLowerCase().trim()));
  }, [assistedPilot, isPro, query]);

  const goTo = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setQuery(""); }}>
      <DialogContent className="gap-0 overflow-hidden border-border bg-card p-0 sm:max-w-lg">
        <DialogHeader className="sr-only"><DialogTitle>Go to a workspace page</DialogTitle></DialogHeader>
        <div className="flex items-center gap-3 border-b border-border px-4"><Search className="size-4 text-muted-foreground" aria-hidden="true" /><input autoFocus className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm" placeholder="Find a workspace page" aria-label="Find a workspace page" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && pages[0]) goTo(pages[0].href); }} /></div>
        <div className="max-h-80 overflow-y-auto p-2">
          {pages.length ? pages.map((page) => <button key={page.href} type="button" onClick={() => goTo(page.href)} className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"><strong className="text-sm text-foreground">{page.label}</strong><span className="text-xs text-muted-foreground">{page.description}</span></button>) : <p className="p-4 text-sm text-muted-foreground">No page matches &ldquo;{query.trim()}&rdquo;.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
