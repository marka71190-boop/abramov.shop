"use client";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { cancelMyOrder, testPay } from "../../checkout/actions";

export function CancelButton({ number }: { number: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn--line btn--sm"
      disabled={pending}
      onClick={() => confirm("Отменить заказ? Товар вернётся в продажу, бонусы — на счёт.") && start(() => cancelMyOrder(number))}
    >
      {pending ? "Отменяем…" : "Отменить заказ"}
    </button>
  );
}

export function TestPayButton({ number }: { number: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn--gold btn--sm" disabled={pending} onClick={() => start(() => testPay(number))}>
      {pending ? "…" : "Отметить оплаченным (тест)"}
    </button>
  );
}

/** Пока ждём уведомление от ЮKassa — тихо обновляем страницу. */
export function AutoRefresh({ seconds, times = 8 }: { seconds: number; times?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      if (++n > times) return clearInterval(t);
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds, times]);
  return null;
}
