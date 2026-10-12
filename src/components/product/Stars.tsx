/** Звёзды рейтинга: заливка золотом по доле. */
export function Stars({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="stars" style={{ fontSize: size }} role="img" aria-label={label ?? `Оценка ${value} из 5`}>
      <span className="stars__bg">★★★★★</span>
      <span className="stars__fg" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  );
}
