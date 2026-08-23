"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { searchRecords, type SearchHit } from "@/app/search-actions";
import { formatDate } from "@/lib/format";

const ICON: Record<SearchHit["kind"], string> = {
  pet: "🐾", vaccination: "💉", medication: "💊",
  visit: "🩺", journal: "📔", document: "📄", field: "🧩",
};

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced: every keystroke would otherwise fire seven queries.
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => setHits(await searchRecords(q)));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setHits(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor="record-search" className="sr-only">
        Search your pets and records
      </label>
      <input
        id="record-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setHits(null)}
        placeholder="Search records — a vaccine, a symptom, a clinic…"
        autoComplete="off"
        className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
      />

      {q.trim().length >= 2 && (
        <div
          className="card absolute z-20 mt-1 max-h-96 w-full overflow-y-auto p-1 shadow-lg"
          role="listbox"
          aria-label="Search results"
        >
          {pending && hits === null ? (
            <p className="muted px-3 py-4 text-center text-xs">Searching…</p>
          ) : hits && hits.length > 0 ? (
            <ul>
              {hits.map((h, i) => (
                <li key={`${h.kind}-${i}`}>
                  <Link
                    href={h.href}
                    onClick={() => setHits(null)}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-brand-50/60"
                  >
                    <span aria-hidden>{ICON[h.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{h.title}</span>
                      <span className="muted block truncate text-xs">
                        {h.petName}
                        {h.subtitle ? ` · ${h.subtitle}` : ""}
                      </span>
                    </span>
                    {h.date && <span className="muted shrink-0 text-xs">{formatDate(h.date)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted px-3 py-4 text-center text-xs">
              Nothing matching &ldquo;{q}&rdquo;.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
