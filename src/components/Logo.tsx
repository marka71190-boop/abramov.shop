/**
 * Логотип Abramov, нарисованный векторами (по исходному файлу 640×640).
 * animated — заставка: золотая «А» прорисовывается линией и заливается,
 * серебряная полоса въезжает сбоку, буквы ABRAMOV проявляются по одной,
 * затем по золоту время от времени пробегает блик. Без анимации для тех,
 * у кого в системе включено «уменьшить движение».
 */
const GOLD =
  "M277,163 Q279,163 281,167 L413,389 L338,389 Q330,389 325,381 L276,301 L184,450 Q178,459 167,459 L95,459 L273,167 Q275,163 277,163 Z";
const SILVER = "M302,164 L372,164 Q382,164 387,172 L525,389 L439,389 Z";
const LETTERS: [string, number][] = [
  ["A", 218],
  ["B", 264],
  ["R", 306],
  ["A", 346],
  ["M", 392],
  ["O", 446],
  ["V", 496],
];

interface Props {
  id: string; // уникальный на странице — для clipPath и градиента
  animated?: boolean;
  className?: string;
  title?: string;
}

export function Logo({ id, animated = false, className, title }: Props) {
  const clip = `lg-clip-${id}`;
  const gloss = `lg-gloss-${id}`;
  return (
    <svg
      viewBox="86 150 456 320"
      className={`logo ${animated ? "logo--animated" : ""} ${className ?? ""}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={clip}>
          <path d={GOLD} />
        </clipPath>
        <linearGradient id={gloss} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="logo__gold" d={GOLD} />
      <path className="logo__silver" d={SILVER} />
      {animated && (
        <g clipPath={`url(#${clip})`}>
          <g transform="skewX(-20)">
            <rect className="logo__gloss" x="40" y="150" width="90" height="330" fill={`url(#${gloss})`} />
          </g>
        </g>
      )}
      <g className="logo__word">
        {LETTERS.map(([ch, x], i) => (
          <text key={i} x={x} y={458} style={{ animationDelay: `${1.55 + i * 0.08}s` }}>
            {ch}
          </text>
        ))}
      </g>
    </svg>
  );
}
