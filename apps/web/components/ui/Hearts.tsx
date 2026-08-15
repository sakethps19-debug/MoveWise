export function Hearts({ current, max }: { current: number; max: number }) {
  return (
    <span className="mw-hearts" aria-label={`${current} of ${max} hearts remaining`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < current ? "mw-heart-full" : "mw-heart-empty"} aria-hidden="true">
          {i < current ? "♥" : "♡"}
        </span>
      ))}
    </span>
  );
}
