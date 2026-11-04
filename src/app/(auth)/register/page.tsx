import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth-errors";
import { getSettings } from "@/lib/settings";
import { getViewer } from "@/lib/viewer";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Регистрация", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function RegisterPage({ searchParams }: Props) {
  const { next } = await searchParams;
  if (await getViewer()) redirect(safeNext(next));
  const settings = await getSettings();
  if (settings.pdPause) {
    return (
      <div className="stack" style={{ textAlign: "center" }}>
        <h1 className="h3">Регистрация временно закрыта</h1>
        <p className="muted">{settings.pdPauseMessage}</p>
        <p>
          <a href="/catalog">Смотреть каталог</a>
        </p>
      </div>
    );
  }
  const n = safeNext(next);
  const welcome = settings.loyalty.welcomeBonus;
  return <RegisterForm next={n} notice={contextNotice(n, welcome)} />;
}

/** Зачем просим войти или зарегистрироваться: пришли из корзины или записи на тренировку */
function contextNotice(next: string, welcome: number) {
  const bonus = welcome > 0 ? ` После подтверждения почты — ${welcome.toLocaleString("ru-RU")} бонусов в подарок.` : "";
  if (next.startsWith("/checkout"))
    return "Аккаунт нужен для заказа: в нём статус и трек посылки, а бонусы с покупки — ваши. Корзина сохранится — после регистрации сразу перейдёте к оформлению." + bonus;
  if (next.startsWith("/trenirovki")) return "Чтобы записаться на тренировку, нужен аккаунт: туда придёт подтверждение и напоминание.";
  return bonus.trim() || null;
}
