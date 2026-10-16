"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--gold"
      onClick={() => {
        navigator.clipboard?.writeText(code).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          },
          () => {},
        );
      }}
    >
      {done ? "Код скопирован" : "Скопировать код"}
    </button>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn btn--line" onClick={() => window.print()}>
      Распечатать
    </button>
  );
}

/** Пока ЮKassa подтверждает оплату — обновляем страницу каждые 3 секунды (до минуты). */
export function WaitPayment() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      if (++n > 20) clearInterval(t);
      else router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
