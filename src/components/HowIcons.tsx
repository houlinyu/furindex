/**
 * Small line-art icons for the "how it works" steps and the breed-scan teaser.
 *
 * Drawn in the same stroke language as the FurIndex mark (see Logo) — one weight,
 * round joins, `currentColor` — so a step reads as a designed icon rather than a
 * platform emoji whose look changes with the reader's OS. Decorative: the step's
 * own text is the label, so these are aria-hidden.
 */

type IconProps = { className?: string };

function Svg({ className = "h-6 w-6", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Step 1 — a document with an up-arrow: drop the report in. */
export function StepUpload({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M12 17.5v-6" />
      <path d="M9.6 13.4 12 11l2.4 2.4" />
    </Svg>
  );
}

/** Step 2 — a magnifier reading lines on a page: it gets read. */
export function StepRead({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
      <path d="M14 3v5h5" />
      <path d="M8 8.5h3M8 12h2.5" />
      <circle cx="16" cy="15" r="3.1" />
      <path d="m18.3 17.3 2.2 2.2" />
    </Svg>
  );
}

/** Step 3 — a ticked box: you confirm every line. */
export function StepConfirm({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8 12 2.6 2.6L16 9.2" />
    </Svg>
  );
}

/** The breed-scan teaser — a camera. */
export function ScanCamera({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 8.5A1.5 1.5 0 0 1 6 7h1.6l.9-1.4A1 1 0 0 1 9.4 5h5.2a1 1 0 0 1 .9.6L16.4 7H18a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 18 18H6a1.5 1.5 0 0 1-1.5-1.5z" />
      <circle cx="12" cy="12.4" r="3.1" />
    </Svg>
  );
}
