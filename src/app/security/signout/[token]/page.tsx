import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signoutEverywhere, signoutTarget } from "@/lib/login-alerts";

export const metadata: Metadata = { title: "Выйти на всех устройствах", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> };

/**
 * Ссылка из письма «Вход с нового устройства — это были вы?».
 * Выходим только по кнопке (POST): почтовые программы сами открывают ссылки из писем, чтобы проверить их.
 */
export default async function SignoutEverywhere({ params, searchParams }: Props) {
  const { token } = await params;
  const { done } = await searchParams;
  const target = done ? null : await signoutTarget(token);

  async function signout() {
    "use server";
    await signoutEverywhere(token);
    redirect(`/security/signout/${token}?done=1`);
  }

  return (
    <main className="kassa-login">
      <div className="kassa-login__box stack" style={{ gap: 16 }}>
        <h1 className="h3" style={{ margin: 0 }}>
          Защита аккаунта
        </h1>
        {done ? (
          <>
            <div className="form-ok">Готово: все входы в аккаунт завершены. Владельцу магазина ушло сообщение.</div>
            <p className="muted">
              Теперь смените пароль: на странице входа нажмите «Забыли пароль?». Если в аккаунт входили по Face ID с чужого устройства — удалите его в кабинете.
            </p>
          </>
        ) : !target ? (
          <p className="muted">Ссылка устарела или уже использована. Если подозреваете чужой вход — смените пароль через «Забыли пароль?».</p>
        ) : (
          <form action={signout} className="stack" style={{ gap: 12 }}>
            <p style={{ margin: 0 }}>{target.name}, если в аккаунт входили не вы — нажмите кнопку. Все входы на всех устройствах сразу завершатся, включая того, кто вошёл.</p>
            <button className="btn btn--gold">Это был не я — выйти везде</button>
          </form>
        )}
      </div>
    </main>
  );
}
