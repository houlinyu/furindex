"use client";

import { useEffect, useState } from "react";

/**
 * Jump-to-section navigation for the pet page, which is long by design — the
 * whole record on one page, no tabs to hunt through — and was therefore only
 * reachable by scrolling.
 *
 * Two renderings of one list: a fixed rail in the left margin on wide screens,
 * and a sticky strip of chips above the content on narrow ones. Both are plain
 * `#id` anchors, so this works with JavaScript off; the observer only adds the
 * highlight.
 */
export interface RailSection {
  id: string;
  label: string;
}

export default function PetSectionRail({ sections }: { sections: RailSection[] }) {
  // Several sections are conditional — the weight chart needs two readings, the
  // journal patterns need timed entries. A link to an anchor that isn't on the
  // page scrolls nowhere and reads as broken, so the list is filtered against
  // what actually rendered rather than against what the page might contain.
  // Starts as the full list rather than empty: the anchors are static, so the
  // server can render them and they work with JavaScript off. Filtering to what
  // actually rendered is the enhancement, not the feature — starting empty meant
  // the rail popped in after hydration and did not exist at all without JS.
  const [present, setPresent] = useState<RailSection[]>(sections);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const found = sections.filter((s) => document.getElementById(s.id));
    setPresent(found);
    if (found.length === 0) return;

    // Bottom margin pulled up so the section under the top of the viewport is
    // the one highlighted, not whichever happens to be tallest.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );
    for (const s of found) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  if (present.length < 2) return null;

  return (
    <>
      {/* Wide screens: the margin beside the max-w-4xl column is empty space.
          Fixed rather than sticky because the column it would stick inside is
          the content itself, and a rail that scrolls away is no shortcut. */}
      <nav
        aria-label="Jump to a section of this record"
        data-testid="pet-rail"
        className="fixed top-24 left-[max(0.5rem,calc(50%-28rem-11.5rem))] z-30 hidden max-h-[calc(100vh-8rem)] w-44 overflow-y-auto xl:block"
      >
        <p className="muted mb-2 px-2 text-[0.65rem] font-medium uppercase tracking-wide">
          On this page
        </p>
        <ul className="space-y-0.5 border-l border-[var(--border)]">
          {present.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? "true" : undefined}
                className={`-ml-px block border-l-2 py-1.5 pl-3 text-xs transition ${
                  active === s.id
                    ? "border-brand-500 font-medium text-[var(--brand-text)]"
                    : "muted border-transparent hover:border-brand-300 hover:text-[var(--brand-text)]"
                }`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Narrow screens: no margin to put a rail in, so the same list becomes a
          horizontally scrolling strip. min-h-11 keeps every chip a real tap
          target rather than a line of text. */}
      <nav
        aria-label="Jump to a section of this record"
        data-testid="pet-rail-chips"
        className="sticky top-0 z-30 -mx-4 mb-6 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur xl:hidden"
      >
        <ul className="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {present.map((s) => (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-lg px-3 text-xs whitespace-nowrap transition ${
                  active === s.id
                    ? "bg-brand-50 font-medium text-[var(--brand-text)] dark:bg-brand-500/15"
                    : "muted hover:text-[var(--brand-text)]"
                }`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
