import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth-errors";
import { getSettings } from "@/lib/settings";
import { getViewer } from "@/lib/viewer";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Вход", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  if (await getViewer()) redirect(safeNext(next));
  const n = safeNext(next);
  const welcome = (await getSettings()).loyalty.welcomeBonus;
  return <LoginForm next={n} notice={contextNotice(n, welcome)} />;
}

/** Зачем просим войти или зарегистрироваться: пришли из корзины или записи на тренировку */
function contextNotice(next: string, welcome: number) {
  const bonus = welcome > 0 ? ` После подтверждения почты — ${welcome.toLocaleString("ru-RU")} бонусов в подарок.` : "";
  if (next.startsWith("/checkout"))
    return "Чтобы оформить заказ, войдите. Корзина сохранится — после входа сразу перейдёте к оформлению.";
  if (next.startsWith("/trenirovki")) return "Чтобы записаться на тренировку, нужен аккаунт: туда придёт подтверждение и напоминание.";
  return null;
}
