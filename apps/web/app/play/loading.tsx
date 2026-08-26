/** Play mode skeleton — a rough board + controls shape, shown instantly on navigation (P1-F). */
export default function Loading() {
  return (
    <div className="mw-skeleton-shell" role="status" aria-label="Loading play mode">
      <div className="mw-skeleton-block" style={{ height: 24, width: "30%" }} />
      <div className="mw-skeleton-block" style={{ height: 400 }} />
      <div className="mw-skeleton-block" style={{ height: 44 }} />
    </div>
  );
}
