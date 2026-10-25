/** Иконки линиями, цвет берут от текста (currentColor). */
type P = { size?: number; className?: string };
const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconUser = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);
export const IconBag = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 8h14l-1.2 12H6.2z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);
export const IconSearch = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);
export const IconArrow = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconArrowUpRight = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);
export const IconTruck = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </svg>
);
export const IconCard = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="6" width="18" height="13" rx="1.5" />
    <path d="M3 10h18M7 15h4" />
  </svg>
);
export const IconStar = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />
  </svg>
);
export const IconTelegram = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M21 4L3 11l6 2.5M21 4l-3 16-6.5-5.5M21 4L9 13.5v5.5l2.5-4" />
  </svg>
);
export const IconLock = ({ size, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5" />
  </svg>
);
