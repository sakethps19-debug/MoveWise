/** Lesson page skeleton — a rough board + prompt shape, shown instantly on navigation (P1-F). */
export default function Loading() {
  return (
    <div className="mw-skeleton-shell" role="status" aria-label="Loading lesson">
      <div className="mw-skeleton-block" style={{ height: 24, width: "40%" }} />
      <div className="mw-skeleton-block" style={{ height: 340 }} />
      <div className="mw-skeleton-block" style={{ height: 48 }} />
    </div>
  );
}
