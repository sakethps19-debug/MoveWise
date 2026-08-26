/** Progress dashboard skeleton — shown instantly on navigation (P1-F). */
export default function Loading() {
  return (
    <div className="mw-skeleton-shell" role="status" aria-label="Loading progress">
      <div className="mw-skeleton-block" style={{ height: 24, width: "35%" }} />
      <div className="mw-skeleton-block" style={{ height: 120 }} />
      <div className="mw-skeleton-block" style={{ height: 120 }} />
    </div>
  );
}
