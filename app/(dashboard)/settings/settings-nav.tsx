"use client";

import { useEffect, useState } from "react";

export type SettingsNavItem = { id: string; label: string };

/**
 * In-page links to each settings section, shown in the page's context panel.
 * Labels repeat the section headings word for word. The link for the section
 * being read gets aria-current, which the panel styles as the current row.
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
    <nav aria-label="Settings sections" className="arc-context-list">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={currentId === item.id ? "location" : undefined}
          onClick={() => setCurrentId(item.id)}
          className="arc-context-link"
        >
          <span className="arc-context-link__title">{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
