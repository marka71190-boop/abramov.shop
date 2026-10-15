import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { checkUnsubscribe, unsubscribe } from "@/lib/campaigns";
import { getActiveConsent } from "@/lib/consent";
import { getRequestMeta } from "@/lib/request";

export const metadata: Metadata = { title: "Отписка от рассылки", robots: { index: false } };

type Props = { searchParams: Promise<{ u?: string; t?: string; done?: string }> };

async function confirm(form: FormData) {
  "use server";
  const u = String(form.get("u") || "");
  const t = String(form.get("t") || "");
  if (!checkUnsubscribe(u, t)) redirect("/unsubscribe");
  await unsubscribe(u, (await getRequestMeta()).ip);
  redirect(`/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}&done=1`);
}

/**
 * Отписка по ссылке из письма. Сначала спрашиваем подтверждение: почтовые сервисы
 * сами открывают ссылки из писем для проверки, и без кнопки человек отписывался бы случайно.
 */
export default async function UnsubscribePage({ searchParams }: Props) {
  const { u, t, done } = await searchParams;
  const valid = checkUnsubscribe(u, t);
  const active = valid ? await getActiveConsent(u!, "MARKETING") : null;

  return (
    <section className="container section" style={{ maxWidth: 640, paddingTop: "clamp(48px, 8vw, 110px)" }}>
      <h1 className="h2" style={{ fontSize: "clamp(32px, 4vw, 48px)" }}>
        Рассылка
      </h1>
      {!valid ? (
        <p className="muted">Ссылка неверная. Отписаться можно в личном кабинете: «Настройки» → «Новости и акции».</p>
      ) : done || !active ? (
        <>
          <p>Вы отписаны от новостей и акций Abramov Shop. Письма о ваших заказах и чеки продолжат приходить.</p>
          <p className="muted small">
            Передумаете — включите «Новости и акции» в <Link href="/account#settings">личном кабинете</Link>.
          </p>
        </>
      ) : (
        <form action={confirm} className="stack">
          <p>Больше не присылать новости, акции и промокоды? Письма о ваших заказах и чеки продолжат приходить.</p>
          <input type="hidden" name="u" value={u} />
          <input type="hidden" name="t" value={t} />
          <div>
            <button className="btn btn--gold">Отписаться</button>
          </div>
        </form>
      )}
    </section>
  );
}
