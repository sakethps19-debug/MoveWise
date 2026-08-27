/** Default route-level loading skeleton — shown instantly on navigation before the destination page has data (P1-F). */
export default function Loading() {
  return (
    <div className="mw-skeleton-shell" role="status" aria-label="Loading">
      <div className="mw-skeleton-block" style={{ height: 32, width: "60%" }} />
      <div className="mw-skeleton-block" style={{ height: 90 }} />
      <div className="mw-skeleton-block" style={{ height: 56 }} />
      <div className="mw-skeleton-block" style={{ height: 56 }} />
      <div className="mw-skeleton-block" style={{ height: 56 }} />
    </div>
  );
}
