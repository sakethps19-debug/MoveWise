export function Stars({ count }: { count: 1 | 2 | 3 }) {
  return (
    <span className="mw-stars" role="img" aria-label={`${count} of 3 stars`}>
      {Array.from({ length: 3 }, (_, i) => (
        <span key={i} className={i < count ? "mw-star-full" : "mw-star-empty"} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}
