import type { Block } from "@/lib/posts";

/**
 * Renders a post body. A server component with no state and no handlers — it
 * must never gain a "use client" directive, because the post pages that import
 * it are server components and pulling a value out of a client module into one
 * is the failure mode this codebase has already been bitten by.
 *
 * The inline vocabulary is exactly three rules, deliberately:
 *
 *   **bold**   _italic_   [text](https://url)
 *
 * Everything is escaped by React on the way out, so this is a formatter, not an
 * HTML sink — no dangerouslySetInnerHTML anywhere in the chain.
 */

const INLINE = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|_[^_]+_)/g;

function inline(text: string, keyBase: string): React.ReactNode[] {
  return text.split(INLINE).map((piece, i) => {
    const key = `${keyBase}-${i}`;
    if (!piece) return null;

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(piece);
    if (link) {
      const [, label, href] = link;
      const external = /^https?:\/\//.test(href);
      return (
        <a
          key={key}
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="underline underline-offset-4 hover:text-[var(--brand-text)]"
        >
          {label}
        </a>
      );
    }

    if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) {
      return (
        <strong key={key} className="font-semibold text-[var(--text)]">
          {piece.slice(2, -2)}
        </strong>
      );
    }

    if (piece.startsWith("_") && piece.endsWith("_") && piece.length > 2) {
      return <em key={key}>{piece.slice(1, -1)}</em>;
    }

    return <span key={key}>{piece}</span>;
  });
}

export default function PostBody({ blocks }: { blocks: Block[] }) {
  return (
    <div>
      {blocks.map((block, i) => {
        const key = `b${i}`;

        if ("h" in block) {
          return (
            <h2 key={key} className="mt-10 text-xl font-semibold tracking-tight">
              {inline(block.h, key)}
            </h2>
          );
        }

        if ("p" in block) {
          return (
            <p key={key} className="muted mt-4 text-base leading-relaxed">
              {inline(block.p, key)}
            </p>
          );
        }

        if ("ul" in block) {
          return (
            <ul key={key} className="muted mt-4 space-y-2 text-base leading-relaxed">
              {block.ul.map((item, j) => (
                <li key={`${key}-${j}`} className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span>{inline(item, `${key}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }

        if ("steps" in block) {
          return (
            <ol key={key} className="mt-6 space-y-4">
              {block.steps.map((step, j) => (
                <li key={`${key}-${j}`} className="card flex gap-4 p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                    {j + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{inline(step.t, `${key}-${j}-t`)}</p>
                    <p className="muted mt-1 text-sm leading-relaxed">
                      {inline(step.b, `${key}-${j}-b`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          );
        }

        return (
          <aside key={key} className="card mt-6 p-5">
            <p className="text-sm font-medium">{inline(block.note.t, `${key}-t`)}</p>
            {block.note.p.map((para, j) => (
              <p key={`${key}-${j}`} className="muted mt-2 text-sm leading-relaxed">
                {inline(para, `${key}-${j}`)}
              </p>
            ))}
          </aside>
        );
      })}
    </div>
  );
}
