"use client";
import { useEffect, useState } from "react";
import { leftText } from "@/lib/banners-shared";

/** «До конца акции: 2 д 14 ч» — обновляется раз в 30 секунд */
export function Countdown({ until, className, prefix = "До конца акции:" }: { until: number; className?: string; prefix?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const left = leftText(until - now);
  if (!left) return null;
  return (
    <span className={className} suppressHydrationWarning>
      <span className="cd__p">{prefix} </span>
      <b suppressHydrationWarning>{left}</b>
    </span>
  );
}
