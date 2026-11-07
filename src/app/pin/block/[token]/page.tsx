import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { blockPinByToken, pinBlockTarget } from "@/lib/pin";

export const metadata: Metadata = { title: "Заблокировать PIN", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> };

/**
 * Ссылка из письма «это был не я». Блокируем только по кнопке (POST):
 * почтовые программы сами открывают ссылки из писем, чтобы проверить их.
 */
export default async function BlockPin({ params, searchParams }: Props) {
  const { token } = await params;
  const { done } = await searchParams;
  const target = done ? null : await pinBlockTarget(token);

  async function block() {
    "use server";
    await blockPinByToken(token);
    redirect(`/pin/block/${token}?done=1`);
  }

  return (
    <main className="kassa-login">
      <div className="kassa-login__box stack" style={{ gap: 16 }}>
        <h1 className="h3" style={{ margin: 0 }}>
          PIN для кассы
        </h1>
        {done ? (
          <>
            <div className="form-ok">PIN заблокирован. Владельцу магазина ушло сообщение.</div>
            <p className="muted">Задать новый PIN: админка → «Касса» → «Мой PIN». Проверьте последние скидки и возвраты в кассе.</p>
          </>
        ) : !target ? (
          <p className="muted">Ссылка устарела или PIN уже заблокирован. Если нужно — задайте новый PIN в админке: «Касса» → «Мой PIN».</p>
        ) : (
          <form action={block} className="stack" style={{ gap: 12 }}>
            <p style={{ margin: 0 }}>
              {target.name}, если подтверждение в кассе делали не вы — заблокируйте PIN. Он сразу перестанет работать, а владелец магазина получит сообщение.
            </p>
            <button className="btn btn--gold">Заблокировать PIN</button>
          </form>
        )}
      </div>
    </main>
  );
}
