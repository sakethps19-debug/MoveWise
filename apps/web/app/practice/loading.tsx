/** Practice hub skeleton — shown instantly on navigation (P1-F). Shared by /practice/[principleId] and /practice/warm-up (no more specific loading.tsx overrides it). */
export default function Loading() {
  return (
    <div className="mw-skeleton-shell" role="status" aria-label="Loading practice">
      <div className="mw-skeleton-block" style={{ height: 24, width: "35%" }} />
      <div className="mw-skeleton-block" style={{ height: 64 }} />
      <div className="mw-skeleton-block" style={{ height: 64 }} />
      <div className="mw-skeleton-block" style={{ height: 64 }} />
    </div>
  );
}
