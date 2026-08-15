/**
 * Original, code-native (SVG, no external asset) unit motifs — see
 * docs/design/system.md's asset/licensing table. Small and quiet by
 * design: a visual anchor for scanning, not decoration competing with
 * the lesson list beneath it.
 */
export function UnitMotif({ unitId }: { unitId: string }) {
  const common = { width: 26, height: 26, viewBox: "0 0 26 26", "aria-hidden": true } as const;

  if (unitId === "meet-the-pieces") {
    // emerging grid — the board taking shape
    return (
      <svg {...common}>
        <rect x="1" y="1" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.9" />
        <rect x="10" y="1" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.5" />
        <rect x="19" y="1" width="6" height="7" rx="1.5" fill="currentColor" opacity="0.25" />
        <rect x="1" y="10" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.5" />
        <rect x="10" y="10" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.9" />
      </svg>
    );
  }
  if (unitId === "check-and-checkmate") {
    // a fortress silhouette — king safety
    return (
      <svg {...common}>
        <path
          d="M4 24V12l3-3V6h3v3h2V5h2v4h2V6h3v3l3 3v12z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (unitId === "basic-tactics") {
    // converging attack lines — a fork
    return (
      <svg {...common}>
        <circle cx="13" cy="13" r="2.5" fill="currentColor" />
        <path d="M13 13L3 5M13 13L23 5M13 13L3 21M13 13L23 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="13" cy="13" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
