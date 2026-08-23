/**
 * The FurIndex mark: one pointed cat ear, one floppy dog ear, one face.
 *
 * Drawn rather than imported so it stays sharp at any size, takes its colour
 * from `currentColor`, and costs no extra request. Kept to seven strokes — an
 * earlier version had whiskers and finer detail that turned to mush at 16px,
 * which is the size that matters most.
 */
export default function Logo({
  className = "h-6 w-6",
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}

      {/* Head. Open at the top-left and top-right so the two ears join it rather
          than sit on top of it. */}
      <path d="M20 17.5C15.3 21.4 12.5 27.2 12.5 34c0 11.3 8.7 19.5 19.5 19.5S51.5 45.3 51.5 34c0-4.6-1.3-8.7-3.6-12" />

      {/* Cat ear, left — straight to a point, meeting the head where it opens. */}
      <path d="M20 17.5 17 7l11.5 6.6" />

      {/* Dog ear, right — a long teardrop hanging outside the head's silhouette.
          It needs to be this large to still read as "floppy" at favicon size. */}
      <path d="M47.9 22c2.4-5.6 6.8-8.6 10.3-6.7 3.6 2 4 8.4 1.1 15-2.4 5.5-6.6 9.2-10 9.2" />

      {/* Eyes and muzzle. */}
      <path d="M25 32v2.5M38 32v2.5" />
      <path d="M31.5 39.5v3" />
      <path d="M31.5 42.5c0 2.2-1.7 3.5-3.6 3.5-1.7 0-2.9-1-3.3-2.2" />
      <path d="M31.5 42.5c0 2.2 1.7 3.5 3.6 3.5 1.7 0 2.9-1 3.3-2.2" />
    </svg>
  );
}
