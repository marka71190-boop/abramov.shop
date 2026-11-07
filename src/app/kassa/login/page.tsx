import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getViewer } from "@/lib/viewer";
import { KassaLoginForm } from "./KassaLoginForm";

export const metadata: Metadata = {
  title: "Вход в кассу",
  robots: { index: false, follow: false },
  manifest: "/kassa/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Касса", statusBarStyle: "black-translucent" },
};
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ login?: string; off?: string }> };

/** Вход рабочего телефона кассы: логин (kassa1) и пароль, которые выдал владелец */
export default async function KassaLogin({ searchParams }: Props) {
  const me = await getViewer();
  if (me && !me.bannedAt) redirect("/kassa");
  const { login, off } = await searchParams;
  return (
    <main className="kassa-login">
      <div className="kassa-login__box stack" style={{ gap: 18 }}>
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <span style={{ width: 64, flex: "none", display: "block" }}>
            <Logo id="kassa-login" />
          </span>
          <div>
            <div className="h3" style={{ margin: 0 }}>
              Касса
            </div>
            <div className="muted small">Abramov Shop</div>
          </div>
        </div>
        {off && <div className="form-error">Этот телефон кассы отключён. Спросите у владельца новый пароль.</div>}
        <KassaLoginForm initialLogin={(login ?? "").replace(/[^a-z0-9-]/gi, "").slice(0, 30)} />
        <p className="muted small" style={{ margin: 0 }}>
          Логин и пароль выдаёт владелец в админке: «Касса» → «Телефоны кассы». Сотрудник со своим аккаунтом —{" "}
          <a href="/login?next=/kassa">войти по почте</a>.
        </p>
      </div>
    </main>
  );
}
