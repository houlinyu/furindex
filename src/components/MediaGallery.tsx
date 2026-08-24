"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  captionMedia,
  deleteMedia,
  retagMedia,
  type MediaState,
} from "@/app/media-actions";
import { formatDate } from "@/lib/format";
import {
  MAX_CAPTION_LENGTH,
  SUGGESTED_TAGS,
  formatBytes,
  formatDuration,
  normaliseTags,
  tagCounts,
  type MediaItem,
} from "@/lib/media";
import { MEDIA_KIND_EMOJI, MEDIA_KIND_LABEL } from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

/**
 * The read side: one chronological timeline of everything attached to a pet,
 * newest first, filterable by tag.
 *
 * Client-side because the filter is the point — a run of "limping" clips across
 * three months is the thing a vet asks for, and making that a round trip per
 * click would be slower and would lose the video's playback position each time.
 * The rows are already on the page; filtering them is a local question.
 */
export default function MediaGallery({ items }: { items: MediaItem[] }) {
  const [active, setActive] = useState<string | null>(null);

  const counts = useMemo(() => tagCounts(items), [items]);
  const shown = useMemo(
    () => (active ? items.filter((i) => i.user_tags?.includes(active)) : items),
    [items, active]
  );

  // A tag can disappear from under the filter — the last item carrying it was
  // deleted or retagged. Without this the list would silently show nothing and
  // look broken.
  useEffect(() => {
    if (active && !counts.some(([t]) => t === active)) setActive(null);
  }, [counts, active]);

  if (items.length === 0) return null;

  return (
    <div>
      {counts.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="muted mr-1 text-xs">Filter</span>
          <button
            type="button"
            aria-pressed={active === null}
            onClick={() => setActive(null)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              active === null
                ? "border-brand-500 bg-brand-600 text-white"
                : "border-[var(--border)] hover:border-brand-400"
            }`}
          >
            All {items.length}
          </button>
          {counts.map(([tag, n]) => (
            <button
              key={tag}
              type="button"
              aria-pressed={active === tag}
              onClick={() => setActive(active === tag ? null : tag)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                active === tag
                  ? "border-brand-500 bg-brand-600 text-white"
                  : "border-[var(--border)] hover:border-brand-400"
              }`}
            >
              {tag} {n}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="muted text-sm">Nothing tagged “{active}”.</p>
      ) : (
        <ol className="space-y-3">
          {shown.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </ol>
      )}
    </div>
  );
}

function MediaCard({ item }: { item: MediaItem }) {
  const [editingTags, setEditingTags] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);

  const meta = [
    MEDIA_KIND_LABEL[item.kind],
    formatDate(item.recorded_on),
    formatDuration(item.duration_seconds),
    formatBytes(item.size_bytes),
  ].filter(Boolean);

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span aria-hidden className="text-lg leading-none">
          {MEDIA_KIND_EMOJI[item.kind]}
        </span>
        <span className="muted text-xs">{meta.join(" · ")}</span>
        <span className="ml-auto">
          <DeleteButton item={item} />
        </span>
      </div>

      <div className="mt-2">
        {item.url == null ? (
          <p className="muted text-sm">
            The file behind this couldn&apos;t be loaded. The note and tags are still
            here.
          </p>
        ) : item.kind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL from a
          // private bucket; next/image would need the host allow-listed and would
          // re-fetch through the optimiser after the signature expires.
          <img
            src={item.url}
            alt={item.caption ?? `Photo added on ${formatDate(item.recorded_on)}`}
            loading="lazy"
            className="max-h-72 rounded-lg border border-[var(--border)] object-contain"
          />
        ) : item.kind === "video" ? (
          <video
            src={item.url}
            controls
            // metadata only: a timeline with a dozen clips must not pull tens of
            // megabytes on load just to show a poster frame.
            preload="metadata"
            playsInline
            className="max-h-72 w-full rounded-lg border border-[var(--border)] bg-black"
          />
        ) : (
          <audio src={item.url} controls preload="metadata" className="w-full" />
        )}
      </div>

      {/* ---- caption ---- */}
      {editingCaption ? (
        <CaptionForm item={item} onDone={() => setEditingCaption(false)} />
      ) : (
        <div className="mt-2">
          {item.caption ? (
            <p className="whitespace-pre-wrap text-sm">{item.caption}</p>
          ) : (
            <p className="muted text-sm italic">No description yet.</p>
          )}
          <button
            type="button"
            onClick={() => setEditingCaption(true)}
            className="muted mt-1 min-h-11 text-xs underline underline-offset-2 hover:text-[var(--brand-text)]"
          >
            {item.caption ? "Edit description" : "Add a description"}
          </button>
        </div>
      )}

      {/* ---- tags ---- */}
      {editingTags ? (
        <TagForm item={item} onDone={() => setEditingTags(false)} />
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.user_tags?.map((t) => (
            <span
              key={t}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs"
            >
              {t}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setEditingTags(true)}
            className="muted min-h-11 text-xs underline underline-offset-2 hover:text-[var(--brand-text)]"
          >
            {item.user_tags?.length ? "Edit tags" : "Add tags"}
          </button>
        </div>
      )}
    </li>
  );
}

function CaptionForm({ item, onDone }: { item: MediaItem; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<MediaState, FormData>(captionMedia, {});
  useEffect(() => {
    if (state.ok) onDone();
    // onDone is recreated every render by the parent; depending on it would
    // re-fire this forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="media_id" value={item.id} />
      <label htmlFor={`caption-${item.id}`} className="sr-only">
        Description
      </label>
      <textarea
        id={`caption-${item.id}`}
        name="caption"
        rows={3}
        maxLength={MAX_CAPTION_LENGTH}
        defaultValue={item.caption ?? ""}
        placeholder="What's happening here, in your own words."
        className={field}
      />
      {state.error && (
        <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-sm disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function TagForm({ item, onDone }: { item: MediaItem; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<MediaState, FormData>(retagMedia, {});
  const [tags, setTags] = useState<string[]>(item.user_tags ?? []);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Suggested chips plus anything this item already carries, so a tag the owner
  // invented is still one click to remove.
  const options = [...new Set([...SUGGESTED_TAGS, ...(item.user_tags ?? []), ...tags])];

  function toggle(t: string) {
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : normaliseTags([...cur, t])));
  }

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="media_id" value={item.id} />
      {/* The full set is submitted, not a diff — unticking has to be able to
          remove a tag, which an append-only submission could never express. */}
      <input type="hidden" name="user_tags" value={tags.join(",")} />

      <div className="flex flex-wrap gap-1.5">
        {options.map((t) => {
          const on = tags.includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              disabled={pending}
              onClick={() => toggle(t)}
              className={`rounded-full border px-3 py-1.5 text-xs disabled:opacity-60 ${
                on
                  ? "border-brand-500 bg-brand-600 text-white"
                  : "border-[var(--border)] hover:border-brand-400"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (draft.trim()) {
                setTags((cur) => normaliseTags([...cur, draft]));
                setDraft("");
              }
            }
          }}
          placeholder="Your own tag"
          aria-label="Add your own tag"
          className={`${field} max-w-[12rem]`}
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save tags"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-sm disabled:opacity-60"
        >
          Cancel
        </button>
      </div>

      {state.error && (
        <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}

/**
 * Its own form so its pending state is its own — one `useActionState` shared
 * across a list would grey out every row's button whenever any one of them was
 * saving, which is the bug ReminderList's ActionButton exists to avoid.
 */
function DeleteButton({ item }: { item: MediaItem }) {
  const [state, formAction, pending] = useActionState<MediaState, FormData>(deleteMedia, {});
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col items-end">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="muted min-h-11 text-xs underline underline-offset-2 hover:text-red-600"
        >
          Delete
        </button>
        {state.error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="media_id" value={item.id} />
      <span className="muted text-xs">Delete this permanently?</span>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-lg bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-xs disabled:opacity-60"
      >
        Keep
      </button>
    </form>
  );
}
