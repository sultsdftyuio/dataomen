"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type SettingsNavItem = { id: string; label: string };

/**
 * In-page links to each settings section. Labels repeat the section headings
 * word for word. The link for the section being read gets aria-current.
 */
export function SettingsNav({ items }: { items: SettingsNavItem[] }) {
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null);
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") return;

    const visible = new Map<string, number>();
    // A section counts as current once it crosses the top third of the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        const first = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (first) setCurrentId(first[0]);
      },
      { rootMargin: "0px 0px -66% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="Settings sections" className="md:sticky md:top-4 md:self-start">
      <ul className="flex flex-wrap gap-1 md:flex-col md:gap-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={currentId === item.id ? "location" : undefined}
              onClick={() => setCurrentId(item.id)}
              className={cn(
                "flex min-h-10 items-center rounded-md px-3 text-sm text-navy-soft md:min-h-9",
                "hover:bg-accent hover:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                "aria-[current=location]:bg-accent aria-[current=location]:text-foreground",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
